import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { newDb } from 'pg-mem';
import { io as connect, type Socket } from 'socket.io-client';
import type { BlockedUser, ClientToServerEvents, ServerToClientEvents } from '@rc/shared';
import { createApp } from './app.ts';
import { MemoryStore, type SafetyStore } from './store.ts';
import { PostgresStore } from './store-postgres.ts';

const stores: [string, () => Promise<SafetyStore>][] = [
  ['MemoryStore', async () => new MemoryStore()],
  [
    'PostgresStore (pg-mem)',
    async () => {
      const { Pool } = newDb().adapters.createPg();
      const store = new PostgresStore(new Pool());
      await store.init();
      return store;
    },
  ],
];

for (const [name, make] of stores) {
  describe(`${name} blocks`, () => {
    test('list shows what the blocker saw; remove lifts only that block', async () => {
      const s = await make();
      await s.addBlock('a', 'b', { gender: 'female', country: 'VN' });
      await s.addBlock('c', 'a');
      const list = await s.listBlocks('a');
      assert.equal(list.length, 1);
      assert.equal(list[0].blocked, 'b');
      assert.equal(list[0].gender, 'female');
      assert.equal(list[0].country, 'VN');
      assert.deepEqual([...(await s.blocksFor('a'))].sort(), ['b', 'c']);
      assert.equal(await s.removeBlock('a', 'b'), true);
      assert.equal(await s.removeBlock('a', 'b'), false);
      assert.deepEqual([...(await s.blocksFor('a'))], ['c'], 'c still blocks a');
    });
  });
}

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const once = <E extends keyof ServerToClientEvents>(s: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => s.once(e, ((x: never) => r(x)) as never));

test('block → shows in my Blocked list without their id → unblock → we can meet again', async () => {
  const app = createApp({ store: new MemoryStore(), statsIntervalMs: 60_000, limits: null });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const open: Client[] = [];
  const sock = async (deviceId: string): Promise<Client> => {
    const s: Client = connect(url, { auth: { deviceId }, transports: ['websocket'], forceNew: true });
    open.push(s);
    await once(s, 'stats');
    return s;
  };
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';
  const join = (s: Client, gender: 'male' | 'female') => s.emit('queue:join', { gender, interests: [], mode: 'video' });
  const list = (s: Client) => new Promise<BlockedUser[]>((r) => s.emit('blocks:list', r));
  try {
    const a = await sock(A);
    const b = await sock(B);
    join(a, 'male');
    await once(a, 'queue:waiting');
    join(b, 'female');
    await once(b, 'match:found');

    a.emit('user:block', 'current');
    await once(a, 'user:blocked');
    const blocked = await list(a);
    assert.equal(blocked.length, 1);
    assert.equal(blocked[0].gender, 'female');
    assert.equal(JSON.stringify(blocked).includes(B), false, "the other device's id never leaves the server");

    // Blocked: they don't meet even after waiting.
    join(b, 'female');
    app.matchmaker.sweep(Date.now() + 60_000);
    assert.ok(!app.matchmaker.partnerOf(a.id!), 'not matched while blocked');

    const ok = await new Promise<boolean>((r) => a.emit('blocks:remove', blocked[0].id, r));
    assert.equal(ok, true);
    assert.deepEqual(await list(a), []);
    // Recent-partner memory still applies, so let the sweep relax it.
    const pairs = app.matchmaker.sweep(Date.now() + 60_000);
    assert.equal(pairs.length, 1, 'they can meet again after unblocking');

    assert.equal(await new Promise<boolean>((r) => a.emit('blocks:remove', 'nope', r)), false);
  } finally {
    for (const s of open) s.disconnect();
    await app.close();
  }
});
