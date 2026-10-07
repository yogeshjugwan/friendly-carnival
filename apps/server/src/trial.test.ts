import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { PublicUser } from '@rc/shared';
import { MemoryAccountStore, NO_PLUS, PostgresAccountStore } from './accounts.ts';
import { createApp } from './app.ts';
import { MemoryStore } from './store.ts';

test('free Plus trial: once, confirmed email, never-had-Plus accounts only', async () => {
  const accounts = new MemoryAccountStore();
  const app = createApp({ store: new MemoryStore(), accounts, statsIntervalMs: 60_000, limits: null });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const post = async (path: string, token: string) => {
    const res = await fetch(url + path, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}' });
    return { status: res.status, body: (await res.json()) as PublicUser };
  };
  const me = async (token: string) => (await (await fetch(`${url}/auth/me`, { headers: { authorization: `Bearer ${token}` } })).json()) as PublicUser;
  try {
    const u = (await accounts.createUser('t@example.com', 'h')) as { id: string };
    const token = await accounts.createToken(u.id, 'session');
    assert.equal((await me(token)).trialAvailable, true);
    assert.equal((await post('/auth/plus/trial', token)).status, 403, 'confirm email first');
    await accounts.markVerified(u.id);
    const started = await post('/auth/plus/trial', token);
    assert.equal(started.status, 200);
    assert.equal(started.body.plus.active, true);
    assert.ok(started.body.plus.until! - Date.now() > 23 * 3_600_000);
    assert.equal(started.body.trialAvailable, false);
    assert.equal((await post('/auth/plus/trial', token)).status, 409, 'only once');

    // Someone who already had Plus can't take a trial.
    const v = (await accounts.createUser('paid@example.com', 'h')) as { id: string };
    await accounts.markVerified(v.id);
    await accounts.setPlus(v.id, { ...NO_PLUS, status: 'canceled', until: Date.now() - 1 });
    const t2 = await accounts.createToken(v.id, 'session');
    assert.equal((await me(t2)).trialAvailable, false);
    assert.equal((await post('/auth/plus/trial', t2)).status, 409);
  } finally {
    await app.close();
  }
});

test('trial flag in Postgres (pg-mem)', async () => {
  const { newDb } = await import('pg-mem');
  const { Pool } = newDb().adapters.createPg();
  const accounts = new PostgresAccountStore(new Pool());
  await accounts.init();
  const u = (await accounts.createUser('p@example.com', 'h')) as { id: string };
  assert.equal(await accounts.useTrial(u.id), true);
  assert.equal(await accounts.useTrial(u.id), false);
  assert.equal((await accounts.userById(u.id))!.trialUsed, true);
});
