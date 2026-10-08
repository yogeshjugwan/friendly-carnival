import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { PublicUser } from '@rc/shared';
import { MemoryAccountStore, PostgresAccountStore } from './accounts.ts';
import { createApp } from './app.ts';
import type { Mail } from './mailer.ts';
import { MemoryStore } from './store.ts';
import { runWinback, unsubscribeSecret, unsubscribeToken } from './winback.ts';

const DAY = 86_400_000;

test('win-back: confirmed, away a week, at most every two weeks, one-click unsubscribe', async () => {
  const accounts = new MemoryAccountStore();
  const sent: Mail[] = [];
  const mailer = { send: async (m: Mail) => void sent.push(m) };
  const now = Date.now();
  const make = async (email: string, opts: { verified?: boolean; seen?: number; interests?: string[] } = {}) => {
    const u = (await accounts.createUser(email, 'h')) as { id: string };
    if (opts.verified !== false) await accounts.markVerified(u.id);
    const user = (await accounts.userById(u.id))!;
    user.createdAt = now - 60 * DAY;
    if (opts.seen !== undefined) await accounts.touchLastSeen(u.id, opts.seen);
    if (opts.interests) user.settings = { ...user.settings, interests: opts.interests };
    return u.id;
  };
  const away = await make('away@example.com', { seen: now - 10 * DAY, interests: ['music', 'cricket', 'films'] });
  await make('recent@example.com', { seen: now - 2 * DAY });
  await make('unconfirmed@example.com', { verified: false, seen: now - 30 * DAY });

  const deps = { accounts, mailer, webUrl: 'https://web.example', serverUrl: 'https://api.example', online: 42 };
  assert.equal(await runWinback({ ...deps, now }), 1);
  assert.equal(sent[0]!.to, 'away@example.com');
  assert.match(sent[0]!.text, /42 people are on randomCall/);
  assert.match(sent[0]!.text, /like music and cricket/);
  assert.match(sent[0]!.headers!['List-Unsubscribe']!, /^<https:\/\/api\.example\/auth\/unsubscribe\?u=/);
  assert.equal(await runWinback({ ...deps, now: now + 3 * DAY }), 0, 'not again within two weeks');
  assert.equal(await runWinback({ ...deps, now: now + 15 * DAY }), 2, 'two weeks later (the other one is now away too)');

  // One-click unsubscribe.
  const app = createApp({ store: new MemoryStore(), accounts, statsIntervalMs: 60_000, limits: null });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  try {
    const t = unsubscribeToken(away, await unsubscribeSecret(accounts));
    assert.equal((await fetch(`${url}/auth/unsubscribe?u=${away}&t=nope`, { method: 'POST' })).status, 400);
    const res = await fetch(`${url}/auth/unsubscribe?u=${away}&t=${t}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
    assert.equal(res.status, 200);
    assert.equal((await accounts.userById(away))!.emailOptOut, true);
    assert.equal(await runWinback({ ...deps, now: now + 40 * DAY }), 1, 'unsubscribed people get nothing');

    // The settings switch.
    const token = await accounts.createToken(away, 'session');
    const on = await fetch(`${url}/auth/emails`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ optOut: false }) });
    assert.equal(((await on.json()) as PublicUser).emailsOn, true);
  } finally {
    await app.close();
  }
});

test('win-back query in Postgres (pg-mem)', async () => {
  const { newDb } = await import('pg-mem');
  const { Pool } = newDb().adapters.createPg();
  const accounts = new PostgresAccountStore(new Pool());
  await accounts.init();
  const u = (await accounts.createUser('p@example.com', 'h')) as { id: string };
  await accounts.markVerified(u.id);
  await accounts.touchLastSeen(u.id, 1_000);
  const later = Date.now() + 30 * DAY;
  assert.equal((await accounts.winbackCandidates(later - 7 * DAY, later - 14 * DAY, 10)).length, 1);
  await accounts.markWinbackSent(u.id, later);
  assert.equal((await accounts.winbackCandidates(later - 7 * DAY, later - 14 * DAY, 10)).length, 0);
  await accounts.setEmailOptOut(u.id, true);
  assert.equal((await accounts.userById(u.id))!.emailOptOut, true);
});
