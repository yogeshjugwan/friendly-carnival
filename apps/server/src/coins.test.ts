import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { GIFTS, type ClientToServerEvents, type GiftEvent, type ServerToClientEvents, type SpendResult, type Wallet } from '@rc/shared';
import { MemoryAccountStore } from './accounts.ts';
import { createApp } from './app.ts';
import { MemoryStore } from './store.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const once = <E extends keyof ServerToClientEvents>(s: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => s.once(e, ((x: never) => r(x)) as never));

test('coins: gifts move coins (half to the receiver), Boost and matches cost coins, never below zero', async () => {
  const accounts = new MemoryAccountStore();
  const app = createApp({ store: new MemoryStore(), accounts, statsIntervalMs: 60_000, limits: { daily: 1, adBonus: 10, maxAds: 5, adMs: 15_000 } });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const user = async (email: string, coins: number) => {
    const u = (await accounts.createUser(email, 'h')) as { id: string };
    if (coins) await accounts.changeCoins(u.id, coins, 'test');
    return { id: u.id, token: await accounts.createToken(u.id, 'session') };
  };
  const rich = await user('rich@example.com', 300);
  const poor = await user('poor@example.com', 0);
  const open: Client[] = [];
  const sock = async (deviceId: string, token: string): Promise<[Client, Wallet]> => {
    const s: Client = connect(url, { auth: { deviceId, token }, transports: ['websocket'], forceNew: true });
    open.push(s);
    const w = once(s, 'wallet');
    await once(s, 'stats');
    return [s, (await w) as Wallet];
  };
  const ask = <T,>(fn: (cb: (r: T) => void) => void) => new Promise<T>((r) => fn(r));
  try {
    const [a, wa] = await sock('11111111-1111-4111-8111-111111111111', rich.token);
    const [b, wb] = await sock('22222222-2222-4222-8222-222222222222', poor.token);
    assert.equal(wa.coins, 300);
    assert.equal(wb.coins, 0);

    // No partner yet.
    assert.deepEqual(await ask<SpendResult>((cb) => a.emit('gift:send', 'rose', cb)), { ok: false, reason: 'no-partner' });

    a.emit('queue:join', { gender: 'male', interests: [], mode: 'text' });
    await once(a, 'queue:waiting');
    b.emit('queue:join', { gender: 'female', interests: [], mode: 'text' });
    await once(b, 'match:found');

    const diamond = GIFTS.find((g) => g.id === 'diamond')!;
    const seen = once(b, 'gift');
    const r = await ask<SpendResult>((cb) => a.emit('gift:send', 'diamond', cb));
    assert.equal(r.ok && r.wallet.coins, 300 - diamond.coins);
    assert.deepEqual((await seen) as GiftEvent, { giftId: 'diamond', from: 'them', earned: diamond.coins / 2 });
    assert.equal((await accounts.userById(poor.id))!.coins, diamond.coins / 2);

    assert.deepEqual(await ask<SpendResult>((cb) => b.emit('gift:send', 'crown', cb)), { ok: false, reason: 'coins' }, 'not enough coins');
    assert.equal(await ask<SpendResult>((cb) => b.emit('gift:send', 'nope', cb)).then((x) => x.ok), false);

    const boost = await ask<SpendResult>((cb) => a.emit('boost:buy', cb));
    assert.ok(boost.ok && boost.wallet.boostUntil! > Date.now());
    assert.ok(app.matchmaker.get(a.id!)!.boostUntil! > Date.now(), 'Boost is live for matching');

    // Daily limit is 1 (used by this match): coins buy 10 more.
    const granted = once(a, 'limit:granted');
    const buy = await ask<SpendResult>((cb) => a.emit('limit:buy', cb));
    assert.equal(buy.ok, true);
    assert.equal((await granted).remaining, 10);
    assert.equal((await accounts.userById(rich.id))!.coins, 300 - 100 - 100 - 30);
  } finally {
    for (const s of open) s.disconnect();
    await app.close();
  }
});
