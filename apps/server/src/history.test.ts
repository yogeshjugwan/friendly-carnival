import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { DM_REQUEST_LIMIT, type ClientToServerEvents, type DmSendResult, type DmThread, type HistoryResult, type PushPayload, type ServerToClientEvents } from '@rc/shared';
import { MemoryAccountStore, PostgresAccountStore } from './accounts.ts';
import { createApp } from './app.ts';
import type { PushSender } from './push.ts';
import { MemoryStore } from './store.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const once = <E extends keyof ServerToClientEvents>(s: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => s.once(e, ((x: never) => r(x)) as never));
const ask = <T,>(fn: (cb: (r: T) => void) => void) => new Promise<T>((r) => fn(r));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('history: who you met (with counts), follow, and message requests', async () => {
  const accounts = new MemoryAccountStore();
  const pushed: { endpoint: string; p: PushPayload }[] = [];
  const pushSender: PushSender = async (sub, body) => void pushed.push({ endpoint: sub.endpoint, p: JSON.parse(body) });
  const app = createApp({ store: new MemoryStore(), accounts, statsIntervalMs: 60_000, limits: null, pushSender, webUrl: 'https://example.com' });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const open: Client[] = [];
  const user = async (email: string) => {
    const u = (await accounts.createUser(email, 'h')) as { id: string };
    return { id: u.id, token: await accounts.createToken(u.id, 'session') };
  };
  let n = 0;
  const sock = async (token?: string, name?: string): Promise<Client> => {
    n++;
    const s: Client = connect(url, { auth: { deviceId: `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`, ...(token ? { token } : {}) }, transports: ['websocket'], forceNew: true });
    open.push(s);
    await once(s, 'stats');
    if (name) s.emit('profile:set', { name, avatar: '🦊', bio: '' });
    return s;
  };
  const meet = async (x: Client, y: Client) => {
    x.emit('queue:join', { gender: 'female', interests: [], mode: 'text' });
    await once(x, 'queue:waiting');
    const m = once(y, 'match:found');
    y.emit('queue:join', { gender: 'male', interests: [], mode: 'text' });
    await m;
    x.emit('queue:leave');
    y.emit('queue:leave');
    await wait(50);
  };
  try {
    const asha = await user('asha@example.com');
    const ravi = await user('ravi@example.com');
    const sa = await sock(asha.token, 'Asha');
    const sr = await sock(ravi.token, 'Ravi');
    const guest = await sock(undefined, 'Guesty');
    await meet(sa, sr);
    await meet(sa, guest);
    await meet(sa, sr);

    const h = (await ask<HistoryResult | null>((cb) => sa.emit('history:list', cb)))!;
    assert.equal(h.total, 3);
    assert.equal(h.recent, 3);
    assert.deepEqual(
      h.people.map((p) => [p.name, p.count, p.hasAccount]),
      [
        ['Ravi', 2, true],
        ['Guesty', 1, false],
      ],
    );
    const raviId = h.people[0]!.id;
    const guestId = h.people[1]!.id;
    assert.equal(h.people[0]!.online, true);
    assert.equal((await ask<HistoryResult | null>((cb) => guest.emit('history:list', cb))), null, 'guests have no history');

    // Follow: only people with accounts.
    assert.equal(await ask<boolean>((cb) => sa.emit('follow:set', guestId, true, cb)), false);
    assert.equal(await ask<boolean>((cb) => sa.emit('follow:set', raviId, true, cb)), true);
    assert.equal((await ask<HistoryResult | null>((cb) => sa.emit('history:list', cb)))!.people[0]!.following, true);

    // Message request: a few messages until they reply.
    for (let i = 0; i < DM_REQUEST_LIMIT; i++) {
      assert.equal((await ask<DmSendResult>((cb) => sa.emit('dm:send', raviId, `hi ${i}`, cb))).ok, true);
    }
    assert.deepEqual(await ask<DmSendResult>((cb) => sa.emit('dm:send', raviId, 'hello??', cb)), { ok: false, reason: 'wait-reply' });
    const raviThreads = (await ask<DmThread[] | null>((cb) => sr.emit('dm:threads', cb)))!;
    assert.equal(raviThreads.length, 1);
    assert.deepEqual([raviThreads[0]!.name, raviThreads[0]!.request, raviThreads[0]!.unread], ['Asha', true, DM_REQUEST_LIMIT]);

    // Ravi opens it: Asha sees ✓✓ read; Ravi replies; the limit is gone.
    const read = once(sa, 'dm:read');
    await ask((cb) => sr.emit('dm:history', raviThreads[0]!.id, cb));
    assert.equal(await read, raviId);
    assert.equal((await ask<DmSendResult>((cb) => sr.emit('dm:send', raviThreads[0]!.id, 'hey Asha!', cb))).ok, true);
    assert.equal((await ask<DmSendResult>((cb) => sa.emit('dm:send', raviId, 'yay', cb))).ok, true);
    const mine = (await ask<DmThread[] | null>((cb) => sa.emit('dm:threads', cb)))![0]!;
    assert.equal(mine.request, false);

    // Followers hear when you come online (a later visit: a fresh server, same accounts).
    await accounts.addPushSubscription(asha.id, { endpoint: 'https://push.example/asha', keys: { p256dh: 'k', auth: 'a' } });
    sa.disconnect();
    sr.disconnect();
    const later = createApp({ store: new MemoryStore(), accounts, statsIntervalMs: 60_000, limits: null, pushSender, webUrl: 'https://example.com' });
    await new Promise<void>((r) => later.http.listen(0, r));
    const r2: Client = connect(`http://localhost:${(later.http.address() as AddressInfo).port}`, {
      auth: { deviceId: '77777777-1111-4111-8111-111111111111', token: ravi.token },
      transports: ['websocket'],
      forceNew: true,
    });
    await once(r2, 'stats');
    r2.emit('profile:set', { name: 'Ravi', avatar: null, bio: '' });
    await wait(2_300);
    r2.disconnect();
    await later.close();
    assert.ok(pushed.some((x) => x.endpoint.endsWith('/asha') && x.p.title === '⭐ Online now' && x.p.body.startsWith('Ravi')), JSON.stringify(pushed));

    // Remove from history.
    const sa2 = await sock(asha.token);
    assert.equal(await ask<boolean>((cb) => sa2.emit('history:remove', guestId, cb)), true);
    assert.deepEqual((await ask<HistoryResult | null>((cb) => sa2.emit('history:list', cb)))!.people.map((p) => p.name), ['Ravi']);
  } finally {
    for (const s of open) s.disconnect();
    await app.close();
  }
});

test('history, follows and threads in Postgres (pg-mem)', async () => {
  const { newDb } = await import('pg-mem');
  const { Pool } = newDb().adapters.createPg();
  const accounts = new PostgresAccountStore(new Pool());
  await accounts.init();
  await accounts.addHistory({ userId: 'a', partnerKey: 'b', partnerUserId: 'b', name: 'B', avatar: null, gender: 'male', country: 'IN', mode: 'video', at: 1 });
  await accounts.addHistory({ userId: 'a', partnerKey: 'g:x', partnerUserId: null, name: '', avatar: null, gender: null, country: null, mode: 'text', at: 2 });
  assert.deepEqual((await accounts.historyOf('a', 10)).map((h) => h.partnerKey), ['g:x', 'b']);
  await accounts.removeHistory('a', 'g:x');
  assert.equal((await accounts.historyOf('a', 10)).length, 1);
  await accounts.follow('a', 'b', true);
  await accounts.follow('a', 'b', true);
  assert.deepEqual([...(await accounts.following('a'))], ['b']);
  assert.deepEqual(await accounts.followers('b'), ['a']);
  await accounts.follow('a', 'b', false);
  assert.equal((await accounts.following('a')).size, 0);
  await accounts.addMessage('a', 'b', 'hi');
  const t = await accounts.threadsOf('b');
  assert.deepEqual([t[0]!.other, t[0]!.unread, t[0]!.theirs, t[0]!.mine], ['a', 1, 1, 0]);
});
