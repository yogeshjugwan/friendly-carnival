import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { CHAT_BURST, COIN_PACKS, INR_COIN_PRICES, type ClientToServerEvents, type RoomJoinResult, type ServerToClientEvents } from '@rc/shared';
import { MemoryAccountStore, PostgresAccountStore } from './accounts.ts';
import { createApp, ROOM_SIGNAL_BURST } from './app.ts';
import { applyPaidOrder } from './razorpay.ts';
import { clientIp } from './safety.ts';
import { MemoryStore } from './store.ts';

test('clientIp: trusts only the proxy-appended X-Forwarded-For entry; cf-connecting-ip only behind Cloudflare', () => {
  const env = {};
  assert.equal(clientIp({ 'x-forwarded-for': '1.1.1.1' }, '10.0.0.1', env), '1.1.1.1');
  // A client-supplied leftmost entry is ignored: the proxy appended the real one on the right.
  assert.equal(clientIp({ 'x-forwarded-for': '6.6.6.6, 2.2.2.2' }, '10.0.0.1', env), '2.2.2.2');
  assert.equal(clientIp({ 'x-forwarded-for': '6.6.6.6, 2.2.2.2, 3.3.3.3' }, undefined, { TRUST_PROXY_HOPS: '2' }), '2.2.2.2');
  assert.equal(clientIp({ 'cf-connecting-ip': '9.9.9.9', 'x-forwarded-for': '2.2.2.2' }, undefined, env), '2.2.2.2', 'cf header spoofable without Cloudflare');
  assert.equal(clientIp({ 'cf-connecting-ip': '9.9.9.9', 'x-forwarded-for': '2.2.2.2' }, undefined, { BEHIND_CLOUDFLARE: '1' }), '9.9.9.9');
  assert.equal(clientIp({}, '10.0.0.1', env), '10.0.0.1');
  assert.equal(clientIp({}, undefined, env), null);
});

/** Memory store whose next coin credit throws (a DB hiccup). */
class FlakyStore extends MemoryAccountStore {
  failNext = true;
  override async changeCoins(userId: string, delta: number, reason: string, ref?: string) {
    if (this.failNext && delta > 0) {
      this.failNext = false;
      throw new Error('db down');
    }
    return super.changeCoins(userId, delta, reason, ref);
  }
}

test('Razorpay: a credit that fails records nothing, so the webhook retry delivers (once)', async () => {
  const accounts = new FlakyStore();
  const u = (await accounts.createUser('pay@example.com', 'h')) as { id: string };
  const order = { id: 'order_x', amount: INR_COIN_PRICES.medium, notes: { userId: u.id, product: 'coins:medium' } };
  await assert.rejects(applyPaidOrder(order, accounts), /db down/);
  assert.equal((await accounts.userById(u.id))!.coins, 0);
  assert.equal(await applyPaidOrder(order, accounts), u.id, 'retry delivers');
  const coins = COIN_PACKS.find((p) => p.id === 'medium')!.coins;
  assert.equal((await accounts.userById(u.id))!.coins, coins);
  assert.equal(await applyPaidOrder(order, accounts), null, 'then a no-op');
  assert.equal((await accounts.userById(u.id))!.coins, coins);
});

// pg-mem does not simulate ROLLBACK, so the failure paths are covered by the memory-store tests;
// here we check the SQL paths (idempotency, both legs, refusal when broke).
test('Postgres (pg-mem): applyPayment is idempotent; transferCoins moves both legs', async () => {
  const { newDb } = await import('pg-mem');
  const { Pool } = newDb().adapters.createPg();
  const accounts = new PostgresAccountStore(new Pool());
  await accounts.init();
  const a = (await accounts.createUser('a@example.com', 'h')) as { id: string };
  const b = (await accounts.createUser('b@example.com', 'h')) as { id: string };
  const p = { ref: 'razorpay:o1', userId: a.id, product: 'coins:small', amount: 2900 };
  assert.equal(await accounts.applyPayment(p, { coins: 100 }), true);
  assert.equal(await accounts.applyPayment(p, { coins: 100 }), false);
  assert.equal((await accounts.userById(a.id))!.coins, 100);

  assert.equal(await accounts.transferCoins(a.id, b.id, 40, 20, 'gift:rose', 'gift-received:rose'), 60);
  assert.equal((await accounts.userById(b.id))!.coins, 20);
  assert.equal(await accounts.transferCoins(a.id, b.id, 999, 10, 'gift:car', 'gift-received:car'), null, 'cannot afford');
  assert.equal((await accounts.userById(a.id))!.coins, 60);
  assert.equal((await accounts.userById(b.id))!.coins, 20);
});

test('memory transferCoins: both legs or neither', async () => {
  const accounts = new MemoryAccountStore();
  const a = (await accounts.createUser('a@example.com', 'h')) as { id: string };
  const b = (await accounts.createUser('b@example.com', 'h')) as { id: string };
  await accounts.changeCoins(a.id, 50, 'test');
  assert.equal(await accounts.transferCoins(a.id, b.id, 80, 40, 'gift:x', 'gift-received:x'), null);
  assert.equal((await accounts.userById(b.id))!.coins, 0);
  assert.equal(await accounts.transferCoins(a.id, b.id, 50, 25, 'gift:x', 'gift-received:x'), 0);
  assert.equal((await accounts.userById(b.id))!.coins, 25);
});

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const once = <E extends keyof ServerToClientEvents>(s: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => s.once(e, ((x: never) => r(x)) as never));

test('rooms: room:chat and room:signal are rate limited per socket', async () => {
  const accounts = new MemoryAccountStore();
  const app = createApp({ store: new MemoryStore(), accounts, statsIntervalMs: 60_000, limits: null });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const open: Client[] = [];
  const sock = async (n: number) => {
    const u = (await accounts.createUser(`r${n}@example.com`, 'h')) as { id: string };
    const token = await accounts.createToken(u.id, 'session');
    const s: Client = connect(url, { auth: { deviceId: `${String(n).padStart(8, '0')}-2222-4222-8222-222222222222`, token }, transports: ['websocket'], forceNew: true });
    open.push(s);
    await once(s, 'stats');
    return s;
  };
  const join = (s: Client) => new Promise<RoomJoinResult>((r) => s.emit('room:join', 'music', 'video', 'female', r));
  try {
    const [a, b] = [await sock(1), await sock(2)];
    const ja = await join(a);
    const jb = await join(b);
    assert.ok(ja.ok && jb.ok && ja.roomId === jb.roomId);

    let chats = 0;
    b.on('room:chat', () => chats++);
    const rejected = once(a, 'chat:rejected');
    for (let i = 0; i <= CHAT_BURST; i++) a.emit('room:chat', `hello number ${i}`);
    assert.equal(await rejected, 'rate-limited');

    let signals = 0;
    b.on('room:signal', () => signals++);
    for (let i = 0; i < ROOM_SIGNAL_BURST + 50; i++) a.emit('room:signal', jb.you, { kind: 'ice', candidate: { candidate: `c${i}`, sdpMid: '0', sdpMLineIndex: 0 } } as never);
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(chats, CHAT_BURST);
    assert.ok(signals > 0 && signals <= ROOM_SIGNAL_BURST, `signals delivered: ${signals}`);
  } finally {
    for (const s of open) s.disconnect();
    await app.close();
  }
});
