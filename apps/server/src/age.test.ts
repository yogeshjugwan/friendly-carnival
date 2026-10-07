import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { ageFrom, type ClientToServerEvents, type PublicUser, type ServerToClientEvents } from '@rc/shared';
import { MemoryAccountStore, PostgresAccountStore } from './accounts.ts';
import { createApp } from './app.ts';
import { MemoryStore } from './store.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const once = <E extends keyof ServerToClientEvents>(s: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => s.once(e, ((x: never) => r(x)) as never));

const yearsAgo = (y: number, days = 0) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - y);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

test('ageFrom: whole years, invalid dates rejected', () => {
  assert.equal(ageFrom(yearsAgo(18)), 18);
  assert.equal(ageFrom(yearsAgo(18, 1)), 17, 'birthday is tomorrow');
  assert.equal(ageFrom('2001-02-29'), null, 'not a leap year');
  assert.equal(ageFrom('3000-01-01'), null, 'future');
  assert.equal(ageFrom('15/08/1999'), null);
});

test('age: under-18 signups refused; Google-style accounts give a birth date; underage reports pause until verified', async () => {
  const accounts = new MemoryAccountStore();
  const app = createApp({ store: new MemoryStore(), accounts, adminToken: 'adm', statsIntervalMs: 60_000, limits: null });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const post = async (path: string, body: unknown, token?: string) => {
    const res = await fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const open: Client[] = [];
  const sock = async (n: number, token?: string): Promise<Client> => {
    const s: Client = connect(url, { auth: { deviceId: `${n}0000000-1111-4111-8111-111111111111`, ...(token ? { token } : {}) }, transports: ['websocket'], forceNew: true });
    open.push(s);
    await once(s, 'stats');
    return s;
  };
  try {
    assert.equal((await post('/auth/signup', { email: 'kid@example.com', password: 'long enough pw', birthDate: yearsAgo(16) })).status, 403);
    assert.equal((await post('/auth/signup', { email: 'nodob@example.com', password: 'long enough pw' })).status, 400);
    const ok = await post('/auth/signup', { email: 'adult@example.com', password: 'long enough pw', birthDate: yearsAgo(25) });
    assert.equal(ok.status, 201);
    assert.equal((ok.body.user as PublicUser).birthDateSet, true);

    // An account without a birth date (as Google sign-in creates) sets it once.
    const g = (await accounts.createUser('g@example.com', 'h')) as { id: string };
    const gt = await accounts.createToken(g.id, 'session');
    const set = await post('/auth/birthdate', { birthDate: yearsAgo(15) }, gt);
    assert.equal((set.body as unknown as PublicUser).ageHold, 'under-18');
    assert.equal((await post('/auth/birthdate', { birthDate: yearsAgo(30) }, gt)).status, 409, 'no changing it afterwards');
    const minor = await sock(1, gt);
    const held = once(minor, 'age:hold');
    minor.emit('queue:join', { gender: 'male', interests: [], mode: 'text' });
    assert.equal(await held, 'under-18');

    // An adult reported as underage is paused until ✓ verified.
    const adultId = (ok.body.user as PublicUser).id;
    const adult = await sock(2, ok.body.token as string);
    const reporter = await sock(3);
    adult.emit('queue:join', { gender: 'female', interests: [], mode: 'text' });
    await once(adult, 'queue:waiting');
    const m = once(reporter, 'match:found');
    reporter.emit('queue:join', { gender: 'male', interests: [], mode: 'text' });
    await m;
    const paused = once(adult, 'age:hold');
    reporter.emit('report:submit', { target: 'current', reason: 'underage', source: 'user' });
    assert.equal(await paused, 'review');
    assert.equal((await accounts.userById(adultId))!.ageReview, true);

    await accounts.submitVerification(adultId, 'peace', 'data:image/jpeg;base64,AA==');
    await fetch(`${url}/admin/verifications/${adultId}/resolve`, { method: 'POST', headers: { authorization: 'Bearer adm', 'content-type': 'application/json' }, body: JSON.stringify({ approve: true }) });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal((await accounts.userById(adultId))!.ageReview, false, 'verification clears the review');
    const w = once(adult, 'queue:waiting');
    adult.emit('queue:join', { gender: 'female', interests: [], mode: 'text' });
    await w;
  } finally {
    for (const s of open) s.disconnect();
    await app.close();
  }
});

test('birth date and age review in Postgres (pg-mem)', async () => {
  const { newDb } = await import('pg-mem');
  const { Pool } = newDb().adapters.createPg();
  const accounts = new PostgresAccountStore(new Pool());
  await accounts.init();
  const u = (await accounts.createUser('a@example.com', 'h')) as { id: string };
  assert.equal(await accounts.setBirthDate(u.id, '1990-01-01'), true);
  assert.equal(await accounts.setBirthDate(u.id, '2010-01-01'), false);
  await accounts.setAgeReview(u.id, true);
  const v = (await accounts.userById(u.id))!;
  assert.deepEqual([v.birthDate, v.ageReview], ['1990-01-01', true]);
});
