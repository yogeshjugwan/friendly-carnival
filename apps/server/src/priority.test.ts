import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { PRIORITY_MATCH, type ClientToServerEvents, type ServerToClientEvents, type SpendResult } from '@rc/shared';
import { MemoryAccountStore } from './accounts.ts';
import { createApp } from './app.ts';
import { MemoryStore } from './store.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const once = <E extends keyof ServerToClientEvents>(s: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => s.once(e, ((x: never) => r(x)) as never));
const ask = <T,>(fn: (cb: (r: T) => void) => void) => new Promise<T>((r) => fn(r));

test('⭐ priority match: costs coins, skips unverified people, matches a verified one first', async () => {
  const accounts = new MemoryAccountStore();
  const app = createApp({ store: new MemoryStore(), accounts, statsIntervalMs: 60_000, limits: null });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const open: Client[] = [];
  let n = 0;
  const sock = async (opts: { coins?: number; verified?: boolean } = {}): Promise<Client> => {
    n++;
    const u = (await accounts.createUser(`p${n}@example.com`, 'h')) as { id: string };
    if (opts.coins) await accounts.changeCoins(u.id, opts.coins, 'test');
    if (opts.verified) {
      await accounts.submitVerification(u.id, 'peace', 'data:image/jpeg;base64,AA==');
      await accounts.resolveVerification(u.id, true);
    }
    const token = await accounts.createToken(u.id, 'session');
    const s: Client = connect(url, { auth: { deviceId: `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`, token }, transports: ['websocket'], forceNew: true });
    open.push(s);
    await once(s, 'stats');
    return s;
  };
  try {
    const buyer = await sock({ coins: 40 });
    buyer.emit('queue:join', { gender: 'male', interests: [], mode: 'text' });
    await once(buyer, 'queue:waiting');
    const r = await ask<SpendResult>((cb) => buyer.emit('match:priority', cb));
    assert.ok(r.ok && r.wallet.coins === 40 - PRIORITY_MATCH.coins);
    assert.deepEqual(await ask<SpendResult>((cb) => buyer.emit('match:priority', cb)), { ok: false, reason: 'invalid' }, 'one at a time');

    // An unverified newcomer is not matched with the buyer…
    const plain = await sock();
    plain.emit('queue:join', { gender: 'female', interests: [], mode: 'text' });
    await once(plain, 'queue:waiting');
    // …a verified one is, ahead of the queue.
    const verified = await sock({ verified: true });
    const m = once(buyer, 'match:found');
    verified.emit('queue:join', { gender: 'female', interests: [], mode: 'text' });
    assert.equal((await m).partner.verified, true);
  } finally {
    for (const s of open) s.disconnect();
    await app.close();
  }
});

test('⭐ priority match is refunded when no verified person comes', async () => {
  const accounts = new MemoryAccountStore();
  const app = createApp({ store: new MemoryStore(), accounts, statsIntervalMs: 60_000, limits: null, priorityWaitMs: 300 });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const u = (await accounts.createUser('r@example.com', 'h')) as { id: string };
  await accounts.changeCoins(u.id, 30, 'test');
  const s: Client = connect(url, { auth: { deviceId: '99999999-1111-4111-8111-111111111111', token: await accounts.createToken(u.id, 'session') }, transports: ['websocket'], forceNew: true });
  try {
    await once(s, 'stats');
    s.emit('queue:join', { gender: 'male', interests: [], mode: 'text' });
    await once(s, 'queue:waiting');
    await ask<SpendResult>((cb) => s.emit('match:priority', cb));
    assert.equal((await accounts.userById(u.id))!.coins, 30 - PRIORITY_MATCH.coins);
    const expired = once(s, 'priority:expired');
    await expired;
    await new Promise((r) => setTimeout(r, 50));
    assert.equal((await accounts.userById(u.id))!.coins, 30, 'refunded');
  } finally {
    s.disconnect();
    await app.close();
  }
});
