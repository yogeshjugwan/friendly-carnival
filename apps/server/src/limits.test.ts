import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, MatchLimitStatus, ServerToClientEvents } from '@rc/shared';
import { createApp } from './app.ts';
import { MatchLimits } from './limits.ts';
import { MemoryStore } from './store.ts';

const opts = { daily: 2, adBonus: 3, maxAds: 1, adMs: 15_000 };

test('free users get a daily allowance; Plus is unlimited; it resets at midnight UTC', () => {
  let now = Date.UTC(2026, 9, 5, 23, 0);
  const l = new MatchLimits(opts, () => now);
  assert.equal(l.canMatch('a', false), true);
  l.count('a');
  l.count('a');
  assert.equal(l.canMatch('a', false), false);
  assert.equal(l.canMatch('a', true), true, 'Plus');
  assert.equal(l.status('a', false).remaining, 0);
  assert.equal(l.status('a', false).resetsAt, Date.UTC(2026, 9, 6));
  now = Date.UTC(2026, 9, 6, 0, 1);
  assert.equal(l.canMatch('a', false), true, 'new day');
});

test('a rewarded video adds matches only after it played long enough, within the daily cap', () => {
  let now = 1_000_000;
  const l = new MatchLimits(opts, () => now);
  l.count('a');
  l.count('a');
  assert.equal(l.finishAd('a'), 'not-started');
  assert.equal(l.startAd('a'), 'ok');
  now += 5_000;
  assert.equal(l.finishAd('a'), 'too-soon');
  now += 10_000;
  assert.equal(l.finishAd('a'), 'ok');
  assert.equal(l.status('a', false).remaining, 3);
  assert.equal(l.status('a', false).adsLeft, 0);
  assert.equal(l.startAd('a'), 'no-ads-left');
});

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const once = <E extends keyof ServerToClientEvents>(s: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => s.once(e, ((x: never) => r(x)) as never));

test('the server refuses Start and Next once a free user is out of matches, and a watched ad unlocks more', async () => {
  let now = 5_000_000;
  const app = createApp({ store: new MemoryStore(), statsIntervalMs: 60_000, limits: { daily: 1, adBonus: 2, maxAds: 1, adMs: 15_000 }, now: () => now });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const sock = async (deviceId: string): Promise<Client> => {
    const s: Client = connect(url, { auth: { deviceId }, transports: ['websocket'], forceNew: true });
    await once(s, 'stats');
    return s;
  };
  const join = (s: Client) => s.emit('queue:join', { gender: 'male', interests: [], mode: 'video' });
  try {
    const me = await sock('11111111-1111-4111-8111-111111111111');
    const other = await sock('22222222-2222-4222-8222-222222222222');
    const third = await sock('33333333-3333-4333-8333-333333333333');

    const status = once(me, 'limit:status');
    join(other);
    await once(other, 'queue:waiting');
    join(me);
    await once(me, 'match:found');
    assert.equal(((await status) as MatchLimitStatus).remaining, 0);

    // Next: the partner is told, but I'm not queued.
    const reached = once(me, 'limit:reached');
    const left = once(other, 'partner:left');
    me.emit('call:next');
    assert.equal(((await reached) as MatchLimitStatus).remaining, 0);
    await left;
    assert.equal(app.matchmaker.waitingCount, 0);

    // Too-quick ad is refused; a full one adds matches.
    me.emit('limit:ad-start');
    me.emit('limit:ad-done');
    assert.equal(await once(me, 'limit:ad-rejected'), 'too-soon');
    now += 15_000;
    me.emit('limit:ad-done');
    assert.equal(((await once(me, 'limit:granted')) as MatchLimitStatus).remaining, 2);

    join(third);
    await once(third, 'queue:waiting');
    join(me);
    await once(me, 'match:found');
    for (const s of [me, other, third]) s.disconnect();
  } finally {
    await app.close();
  }
});
