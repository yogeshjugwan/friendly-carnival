import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { STREAK_REWARDS, type ClientToServerEvents, type DailyStatus, type ServerToClientEvents } from '@rc/shared';
import { MemoryAccountStore, PostgresAccountStore } from './accounts.ts';
import { dayOf } from './analytics.ts';
import { createApp } from './app.ts';
import { MemoryStore } from './store.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const once = <E extends keyof ServerToClientEvents>(s: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => s.once(e, ((x: never) => r(x)) as never));

test('daily reward: needs a confirmed email and a chat today, once per day, streak grows', async () => {
  const accounts = new MemoryAccountStore();
  const app = createApp({ store: new MemoryStore(), accounts, statsIntervalMs: 60_000, limits: null });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const u = (await accounts.createUser('d@example.com', 'h')) as { id: string };
  const token = await accounts.createToken(u.id, 'session');
  const call = async (path: string, body?: unknown) => {
    const res = await fetch(url + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const open: Client[] = [];
  try {
    let st = (await call('/auth/daily')).body as unknown as DailyStatus;
    assert.deepEqual(st, { streak: 0, claimedToday: false, reward: STREAK_REWARDS[0], needsChat: true, needsEmail: true });
    assert.equal((await call('/auth/daily/claim', {})).status, 403, 'email first');
    await accounts.markVerified(u.id);
    assert.equal((await call('/auth/daily/claim', {})).status, 409, 'chat first');

    // Have a chat.
    const a: Client = connect(url, { auth: { deviceId: '10000000-1111-4111-8111-111111111111', token }, transports: ['websocket'], forceNew: true });
    const b: Client = connect(url, { auth: { deviceId: '20000000-1111-4111-8111-111111111111' }, transports: ['websocket'], forceNew: true });
    open.push(a, b);
    await Promise.all([once(a, 'stats'), once(b, 'stats')]);
    a.emit('queue:join', { gender: 'male', interests: [], mode: 'text' });
    await once(a, 'queue:waiting');
    const m = once(b, 'match:found');
    b.emit('queue:join', { gender: 'female', interests: [], mode: 'text' });
    await m;

    const wallet = once(a, 'wallet');
    const claimed = await call('/auth/daily/claim', {});
    assert.equal(claimed.status, 200);
    assert.equal(claimed.body.coins, STREAK_REWARDS[0]);
    assert.equal((await wallet).coins, STREAK_REWARDS[0], 'open tabs see the coins');
    st = claimed.body.status as unknown as DailyStatus;
    assert.deepEqual(st, { streak: 1, claimedToday: true, reward: STREAK_REWARDS[1], needsChat: false, needsEmail: false });
    assert.equal((await call('/auth/daily/claim', {})).status, 409, 'once a day');

    // Pretend the last claim was yesterday: the streak continues; two days ago: it resets.
    const yesterday = dayOf(Date.now() - 86_400_000);
    const user = (await accounts.userById(u.id))!;
    user.streakLastDay = yesterday;
    user.streakDays = 6;
    assert.equal(((await call('/auth/daily')).body as unknown as DailyStatus).reward, STREAK_REWARDS[6]);
    user.streakLastDay = dayOf(Date.now() - 2 * 86_400_000);
    assert.deepEqual((await call('/auth/daily')).body, { streak: 0, claimedToday: false, reward: STREAK_REWARDS[0], needsChat: false, needsEmail: false });
  } finally {
    for (const s of open) s.disconnect();
    await app.close();
  }
});

test('streak storage in Postgres (pg-mem): compare-and-set per day', async () => {
  const { newDb } = await import('pg-mem');
  const { Pool } = newDb().adapters.createPg();
  const accounts = new PostgresAccountStore(new Pool());
  await accounts.init();
  const u = (await accounts.createUser('s@example.com', 'h')) as { id: string };
  assert.equal(await accounts.setStreak(u.id, 1, '2026-10-07', null), true);
  assert.equal(await accounts.setStreak(u.id, 1, '2026-10-07', null), false, 'second tap loses');
  assert.equal(await accounts.setStreak(u.id, 2, '2026-10-08', '2026-10-07'), true);
  const v = (await accounts.userById(u.id))!;
  assert.deepEqual([v.streakDays, v.streakLastDay], [2, '2026-10-08']);
});
