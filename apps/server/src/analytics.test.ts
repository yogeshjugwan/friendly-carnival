import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@rc/shared';
import { MemoryAccountStore } from './accounts.ts';
import { Analytics, dayOf } from './analytics.ts';
import { createApp } from './app.ts';
import { MemoryStore } from './store.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const once = <E extends keyof ServerToClientEvents>(s: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => s.once(e, ((x: never) => r(x)) as never));

interface Dashboard {
  days: { day: string; values: Record<string, number> }[];
  totals: { users: number; plusActive: number; verified: number; online: number };
}

test('admin analytics: visitors, matches, peak online, sign-ups and coin sales per day', async () => {
  const accounts = new MemoryAccountStore();
  const app = createApp({ store: new MemoryStore(), accounts, adminToken: 'adm', statsIntervalMs: 60_000, limits: null });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const open: Client[] = [];
  const sock = async (deviceId: string): Promise<Client> => {
    const s: Client = connect(url, { auth: { deviceId }, transports: ['websocket'], forceNew: true });
    open.push(s);
    await once(s, 'stats');
    return s;
  };
  try {
    const u = (await accounts.createUser('buyer@example.com', 'h')) as { id: string };
    await accounts.changeCoins(u.id, 550, 'purchase', 'stripe:test');

    const a = await sock('11111111-1111-4111-8111-111111111111');
    const b = await sock('22222222-2222-4222-8222-222222222222');
    await sock('11111111-1111-4111-8111-111111111111'); // same browser, second tab
    a.emit('queue:join', { gender: 'male', interests: [], mode: 'video' });
    await once(a, 'queue:waiting');
    const m = once(b, 'match:found');
    b.emit('queue:join', { gender: 'female', interests: [], mode: 'video' });
    await m;

    const res = await fetch(`${url}/admin/analytics?days=7`, { headers: { authorization: 'Bearer adm' } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as Dashboard;
    assert.equal(body.days.length, 7);
    const today = body.days.at(-1)!;
    assert.equal(today.day, dayOf(Date.now()));
    assert.equal(today.values.visitors, 2, 'two browsers');
    assert.equal(today.values.matches, 1);
    assert.equal(today.values.videoMatches, 1);
    assert.equal(today.values.peakOnline, 3);
    assert.equal(today.values.signups, 1);
    assert.equal(today.values.coinsSold, 550);
    assert.equal(body.totals.users, 1);
    assert.equal((await fetch(`${url}/admin/analytics`)).status, 401);
  } finally {
    for (const s of open) s.disconnect();
    await app.close();
  }
});

test('analytics: saved counters carry over a restart and reset on a new day', async () => {
  const store = new MemoryStore();
  let now = Date.UTC(2026, 9, 7, 10, 0);
  const one = new Analytics(store, () => now);
  one.visit('a');
  one.count('matches', 3);
  one.peak('peakOnline', 5);
  await one.stop();

  const two = new Analytics(store, () => now);
  two.visit('b');
  two.count('matches');
  two.peak('peakOnline', 2);
  assert.deepEqual((await two.today()).values, { visitors: 2, matches: 4, peakOnline: 5 });

  now += 24 * 3_600_000;
  two.count('matches');
  assert.deepEqual((await two.today()).values, { matches: 1 });
  await two.stop();
  const days = await store.listStats('2026-01-01');
  assert.deepEqual(
    days.map((d) => d.values.matches),
    [4, 1],
  );
});

test('stats storage in Postgres (pg-mem)', async () => {
  const { newDb } = await import('pg-mem');
  const { PostgresStore } = await import('./store-postgres.ts');
  const { Pool } = newDb().adapters.createPg();
  const store = new PostgresStore(new Pool());
  await store.init();
  await store.saveStats('2026-10-06', { matches: 3, visitors: 2 });
  await store.saveStats('2026-10-07', { matches: 1 });
  await store.saveStats('2026-10-07', { matches: 2, peakOnline: 4 });
  assert.deepEqual(await store.loadStats('2026-10-07'), { matches: 2, peakOnline: 4 });
  assert.deepEqual(await store.listStats('2026-10-07'), [{ day: '2026-10-07', values: { matches: 2, peakOnline: 4 } }]);
  assert.equal((await store.listStats('2026-10-01')).length, 2);
});
