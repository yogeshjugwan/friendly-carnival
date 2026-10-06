import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { REFERRAL, type ClientToServerEvents, type ReferralInfo, type ReferralReward, type ServerToClientEvents } from '@rc/shared';
import { isPlusActive, MemoryAccountStore, NO_PLUS, PostgresAccountStore } from './accounts.ts';
import { createApp } from './app.ts';
import { MemoryStore } from './store.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const once = <E extends keyof ServerToClientEvents>(s: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => s.once(e, ((x: never) => r(x)) as never));

test('referrals: invite link, one reward each after the first chat, Plus day or coins', async () => {
  const accounts = new MemoryAccountStore();
  const app = createApp({ store: new MemoryStore(), accounts, statsIntervalMs: 60_000, limits: null });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const call = async (path: string, token: string, body?: unknown) => {
    const res = await fetch(url + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const user = async (email: string, verified = true) => {
    const u = (await accounts.createUser(email, 'h')) as { id: string };
    if (verified) await accounts.markVerified(u.id);
    return { id: u.id, token: await accounts.createToken(u.id, 'session') };
  };
  const open: Client[] = [];
  let n = 0;
  const sock = async (token?: string): Promise<Client> => {
    const deviceId = `${String(++n).padStart(8, '0')}-1111-4111-8111-111111111111`;
    const s: Client = connect(url, { auth: token ? { deviceId, token } : { deviceId }, transports: ['websocket'], forceNew: true });
    open.push(s);
    await once(s, 'stats');
    return s;
  };
  const chat = async (x: Client, y: Client) => {
    x.emit('queue:join', { gender: 'male', interests: [], mode: 'text' });
    await once(x, 'queue:waiting');
    const m = once(y, 'match:found');
    y.emit('queue:join', { gender: 'female', interests: [], mode: 'text' });
    await m;
  };
  try {
    const inviter = await user('inviter@example.com');
    const info = (await call('/auth/referral', inviter.token)).body as unknown as ReferralInfo;
    assert.match(info.code, /^[a-z0-9]{8}$/);
    assert.equal(((await call('/auth/referral', inviter.token)).body as unknown as ReferralInfo).code, info.code, 'stable code');

    const friend = await user('friend@example.com');
    assert.equal((await call('/auth/referral', inviter.token, { code: info.code })).status, 404, 'not your own link');
    assert.equal((await call('/auth/referral', friend.token, { code: 'nope1234' })).status, 404);
    assert.equal((await call('/auth/referral', friend.token, { code: info.code })).status, 200);
    assert.equal((await call('/auth/referral', friend.token, { code: info.code })).status, 409, 'only once');

    // Chatting with the inviter doesn't count.
    const sInviter = await sock(inviter.token);
    const sFriend = await sock(friend.token);
    let early = false;
    sFriend.once('referral:rewarded', () => (early = true));
    await chat(sInviter, sFriend);
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(early, false);
    sInviter.emit('queue:leave');
    sFriend.emit('queue:leave');

    // A chat with a stranger pays both, once.
    const stranger = await sock();
    const [rf, ri] = [once(sFriend, 'referral:rewarded'), once(sInviter, 'referral:rewarded')];
    await chat(stranger, sFriend);
    assert.deepEqual((await rf) as ReferralReward, { kind: 'plus', days: REFERRAL.plusDays });
    assert.deepEqual((await ri) as ReferralReward, { kind: 'plus', days: REFERRAL.plusDays });
    assert.ok(isPlusActive((await accounts.userById(friend.id))!.plus));
    assert.ok(isPlusActive((await accounts.userById(inviter.id))!.plus));
    assert.deepEqual(((await call('/auth/referral', inviter.token)).body as unknown as ReferralInfo).rewarded, 1);

    // A paying inviter gets coins instead; an unconfirmed email gets nothing yet.
    await accounts.setPlus(inviter.id, { ...NO_PLUS, status: 'active', plan: 'monthly', until: Date.now() + 30 * 86_400_000 });
    const second = await user('second@example.com');
    const unconfirmed = await user('unconfirmed@example.com', false);
    await call('/auth/referral', second.token, { code: info.code });
    await call('/auth/referral', unconfirmed.token, { code: info.code });
    const sSecond = await sock(second.token);
    const sUnconfirmed = await sock(unconfirmed.token);
    let paidUnconfirmed = false;
    sUnconfirmed.once('referral:rewarded', () => (paidUnconfirmed = true));
    const coins = once(sInviter, 'referral:rewarded');
    await chat(sUnconfirmed, sSecond);
    assert.deepEqual((await coins) as ReferralReward, { kind: 'coins', coins: REFERRAL.coins });
    assert.equal((await accounts.userById(inviter.id))!.coins, REFERRAL.coins);
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(paidUnconfirmed, false);
    assert.deepEqual(((await call('/auth/referral', inviter.token)).body as unknown as ReferralInfo), { code: info.code, invited: 3, rewarded: 2 });
  } finally {
    for (const s of open) s.disconnect();
    await app.close();
  }
});

test('referral storage in Postgres (pg-mem)', async () => {
  const { newDb } = await import('pg-mem');
  const { Pool } = newDb().adapters.createPg();
  const accounts = new PostgresAccountStore(new Pool());
  await accounts.init();
  const a = (await accounts.createUser('a@example.com', 'h')) as { id: string };
  const b = (await accounts.createUser('b@example.com', 'h')) as { id: string };
  const code = await accounts.referralCode(a.id);
  assert.equal(await accounts.referralCode(a.id), code);
  assert.equal((await accounts.userByReferralCode(code.toUpperCase()))!.id, a.id);
  assert.equal(await accounts.setReferredBy(b.id, a.id), true);
  assert.equal(await accounts.setReferredBy(b.id, a.id), false);
  assert.equal(await accounts.markReferralRewarded(b.id), true);
  assert.equal(await accounts.markReferralRewarded(b.id), false);
  assert.deepEqual(await accounts.referralCounts(a.id), { invited: 1, rewarded: 1 });
  assert.equal((await accounts.userById(b.id))!.referredBy, a.id);
});
