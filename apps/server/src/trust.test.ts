import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@rc/shared';
import { createApp } from './app.ts';
import { MemoryStore } from './store.ts';
import { LOW_TRUST, SkipTracker, trustScore } from './trust.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const once = <E extends keyof ServerToClientEvents>(s: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => s.once(e, ((x: never) => r(x)) as never));
const never = (s: Client, e: keyof ServerToClientEvents, ms = 400) =>
  new Promise<boolean>((r) => {
    const t = setTimeout(() => r(true), ms);
    s.once(e, (() => (clearTimeout(t), r(false))) as never);
  });

const base = { verified: false, loggedIn: false, accountAgeMs: null, reporters7d: 0, matches24h: 0, quickSkips24h: 0 };

test('trust score: reports and instant skips lower it; verification and old accounts raise it', () => {
  assert.equal(trustScore(base), 50);
  assert.ok(trustScore({ ...base, reporters7d: 2 }) >= LOW_TRUST, 'two reporters: not yet');
  assert.ok(trustScore({ ...base, reporters7d: 3 }) < LOW_TRUST, 'three reporters in a week: shadow pool');
  assert.ok(trustScore({ ...base, reporters7d: 3, verified: true, loggedIn: true, accountAgeMs: 30 * 86_400_000 }) >= LOW_TRUST);
  assert.ok(trustScore({ ...base, matches24h: 20, quickSkips24h: 18 }) < LOW_TRUST, 'nearly everyone skips them at once');
  assert.ok(trustScore({ ...base, matches24h: 20, quickSkips24h: 8 }) >= LOW_TRUST, 'normal skipping is fine');

  let now = 0;
  const t = new SkipTracker(() => now);
  t.matched('a', 'b');
  t.quickSkipped('a', 'b');
  assert.deepEqual(t.stats('a'), { matches24h: 1, quickSkips24h: 1 });
  // The same partner skipping again and again counts once.
  for (let i = 0; i < 30; i++) {
    t.matched('a', 'b');
    t.quickSkipped('a', 'b');
  }
  assert.deepEqual(t.stats('a'), { matches24h: 1, quickSkips24h: 1 }, 'one partner counts once');
  t.matched('a', 'c');
  assert.deepEqual(t.stats('a'), { matches24h: 2, quickSkips24h: 1 });
  now += 25 * 3_600_000;
  assert.deepEqual(t.stats('a'), { matches24h: 0, quickSkips24h: 0 }, '24 h window');
});

test('shadow pool: low-trust people only meet each other', async () => {
  const store = new MemoryStore();
  const bad = (n: number) => `${n}0000000-1111-4111-8111-111111111111`;
  // Three different people reported each "bad" device this week.
  for (const target of [bad(1), bad(2)]) {
    for (const reporter of ['r1', 'r2', 'r3']) {
      await store.addReport({ reporterDevice: reporter, targetDevice: target, targetIpHash: null, targetUserId: null, reason: 'harassment', source: 'user', note: null, snapshot: null, aiScore: null });
    }
  }
  const app = createApp({ store, statsIntervalMs: 60_000, limits: null });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const open: Client[] = [];
  const sock = async (deviceId: string): Promise<Client> => {
    const s: Client = connect(url, { auth: { deviceId }, transports: ['websocket'], forceNew: true });
    open.push(s);
    await once(s, 'stats');
    await new Promise((r) => setTimeout(r, 50)); // trust is computed right after connecting
    return s;
  };
  try {
    const troll = await sock(bad(1));
    troll.emit('queue:join', { gender: 'male', interests: [], mode: 'text' });
    await once(troll, 'queue:waiting');

    const normal = await sock('90000000-1111-4111-8111-111111111111');
    normal.emit('queue:join', { gender: 'female', interests: [], mode: 'text' });
    assert.equal(await never(normal, 'match:found'), true, 'a normal user is not matched with a low-trust one');

    const troll2 = await sock(bad(2));
    const m = once(troll, 'match:found');
    troll2.emit('queue:join', { gender: 'female', interests: [], mode: 'text' });
    await m;
    assert.equal(app.matchmaker.lowTrustCount, 2);
  } finally {
    for (const s of open) s.disconnect();
    await app.close();
  }
});
