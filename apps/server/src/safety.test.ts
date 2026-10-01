import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type { BanInfo, ClientToServerEvents, ServerToClientEvents } from '@rc/shared';
import { createApp, type App } from './app.ts';
import { MemoryStore } from './store.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const TOKEN = 'test-admin-token';
let app: App;
let url: string;
const clients: Client[] = [];

before(async () => {
  app = createApp({ statsIntervalMs: 60_000, store: new MemoryStore(), adminToken: TOKEN });
  await new Promise<void>((resolve) => app.http.listen(0, resolve));
  url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
});

after(async () => {
  clients.forEach((c) => c.disconnect());
  await app.close();
});

const client = async (deviceId = randomUUID()): Promise<Client> => {
  const c: Client = connect(url, { transports: ['websocket'], forceNew: true, auth: { deviceId } });
  clients.push(c);
  await new Promise<void>((resolve) => c.once('connect', () => resolve()));
  return c;
};

const next = <E extends keyof ServerToClientEvents>(c: Client, event: E, ms = 2_000) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    c.once(event, ((arg: never) => {
      clearTimeout(t);
      resolve(arg);
    }) as never);
  });

/** Pair `a` (already connected) with a fresh stranger and return the stranger. */
/** Wait until earlier tests' leave/disconnect events have reached the server. */
const queueEmpty = async () => {
  for (let i = 0; i < 100 && app.matchmaker.waitingCount > 0; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(app.matchmaker.waitingCount, 0, 'queue should be empty between steps');
};

const meet = async (target: Client) => {
  await queueEmpty();
  const waiting = next(target, 'queue:waiting');
  target.emit('queue:join', { gender: 'male', interests: [], mode: 'video' });
  await waiting;
  const reporter = await client();
  const matched = next(reporter, 'match:found');
  reporter.emit('queue:join', { gender: 'male', interests: [], mode: 'video' });
  await matched;
  return reporter;
};

const admin = (path: string, init: RequestInit = {}) =>
  fetch(url + path, { ...init, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...init.headers } });

test('admin API requires the token', async () => {
  assert.equal((await fetch(url + '/admin/summary')).status, 401);
  assert.equal((await fetch(url + '/admin/summary', { headers: { authorization: 'Bearer nope' } })).status, 401);
  const res = await admin('/admin/summary');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).openReports, 0);
});

test('three different reporters auto-ban the target, who is kicked and can appeal', async () => {
  const targetDevice = randomUUID();
  const target = await client(targetDevice);

  for (let i = 0; i < 3; i++) {
    const reporter = await meet(target);
    const received = next(reporter, 'report:received');
    const banned = i === 2 ? next(target, 'banned') : null;
    reporter.emit('report:submit', {
      target: 'current',
      reason: 'harassment',
      source: 'user',
      snapshot: 'data:image/jpeg;base64,/9j/AAAA',
    });
    await received;
    if (banned) {
      const ban = (await banned) as BanInfo;
      assert.match(ban.reason, /several users/);
      assert.ok(ban.expiresAt! > Date.now());
    } else {
      // The reporter is now blocked from this target; end the call so the next reporter can meet them.
      const left = next(target, 'partner:left');
      reporter.emit('queue:leave');
      await left;
    }
  }

  // Banned users cannot queue, even from a new connection on the same device.
  const again = await client(targetDevice);
  const stillBanned = next(again, 'banned');
  again.emit('queue:join', { gender: 'male', interests: [], mode: 'video' });
  const ban = (await stillBanned) as BanInfo;

  const appealed = next(again, 'ban:appealed');
  again.emit('ban:appeal', 'I was not harassing anyone');
  await appealed;

  const summary = await (await admin('/admin/summary')).json();
  assert.equal(summary.activeBans, 1);
  assert.equal(summary.openAppeals, 1);
  assert.equal(summary.openReports, 0, 'reports are resolved by the ban');

  const [appeal] = await (await admin('/admin/appeals?status=open')).json();
  assert.equal(appeal.banId, ban.banId);
  const resolved = await admin(`/admin/appeals/${appeal.id}/resolve`, { method: 'POST', body: JSON.stringify({ approve: true }) });
  assert.equal(resolved.status, 200);
  assert.equal((await (await admin('/admin/bans')).json()).length, 0, 'approving lifts the ban');

  const fresh = await client(targetDevice);
  const ok = next(fresh, 'queue:waiting');
  fresh.emit('queue:join', { gender: 'male', interests: [], mode: 'video' });
  await ok;
  fresh.emit('queue:leave');
  [target, again].forEach((c) => c.disconnect());
});

test('admin can ban from a report; the report becomes actioned', async () => {
  const target = await client();
  const reporter = await meet(target);
  const received = next(reporter, 'report:received');
  reporter.emit('report:submit', { target: 'current', reason: 'nudity', source: 'user' });
  await received;

  const [report] = await (await admin('/admin/reports?status=open')).json();
  assert.equal(report.reason, 'nudity');
  const kicked = next(target, 'banned');
  const res = await admin(`/admin/reports/${report.id}/action`, {
    method: 'POST',
    body: JSON.stringify({ action: 'ban', durationHours: null }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ipHash, null, 'IP is only banned when includeIp is set');
  assert.equal(((await kicked) as BanInfo).expiresAt, null, 'permanent ban');
  assert.equal((await (await admin('/admin/reports?status=open')).json()).length, 0);

  const bad = await admin(`/admin/reports/${report.id}/action`, { method: 'POST', body: JSON.stringify({ action: 'ban', durationHours: -1 }) });
  assert.equal(bad.status, 400);
  reporter.disconnect();
  target.disconnect();
});

test('blocked users are never matched again; reporting needs a partner', async () => {
  const a = await client();
  const b = await meet(a);
  const rejected = next(b, 'report:rejected');
  b.emit('report:submit', { target: 'previous', reason: 'other', source: 'user' });
  assert.equal(await rejected, 'no-target');

  const blocked = next(b, 'user:blocked');
  const aLeft = next(a, 'partner:left');
  b.emit('user:block', 'current');
  await Promise.all([blocked, aLeft]);

  // Both search again; the block must keep them apart (and Back is refused).
  const aWaiting = next(a, 'queue:waiting');
  a.emit('queue:join', { gender: 'male', interests: [], mode: 'video' });
  await aWaiting;
  const back = next(b, 'back:unavailable');
  b.emit('call:back');
  assert.equal(await back, 'declined');
  assert.equal(app.matchmaker.partnerOf(a.id!), undefined);
  a.disconnect();
  b.disconnect();
});

test('AI nudity flags from two partners within an hour issue a short ban', async () => {
  const target = await client();
  for (let i = 0; i < 2; i++) {
    const watcher = await meet(target);
    const received = next(watcher, 'report:received');
    const banned = i === 1 ? next(target, 'banned') : null;
    watcher.emit('report:submit', { target: 'current', reason: 'nudity', source: 'ai', aiScore: 0.98 });
    await received;
    if (banned) assert.match(((await banned) as BanInfo).reason, /nudity detected/);
    else {
      const left = next(target, 'partner:left');
      watcher.emit('queue:leave');
      await left;
    }
  }
  target.disconnect();
});
