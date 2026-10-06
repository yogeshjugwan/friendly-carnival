import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TurnCredentials } from './turn.ts';

const STUN = [{ urls: ['stun:stun.l.google.com:19302'] }];

test('Cloudflare: fetches short-lived TURN credentials and serves them with STUN', async () => {
  let calls = 0;
  const fake = (async (url: string | URL | Request, init?: RequestInit) => {
    calls++;
    assert.match(String(url), /rtc\.live\.cloudflare\.com\/v1\/turn\/keys\/key123\/credentials\/generate-ice-servers$/);
    assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer tok');
    assert.deepEqual(JSON.parse(String(init?.body)), { ttl: 86400 });
    return Response.json({ iceServers: { urls: ['turn:turn.cloudflare.com:3478?transport=udp'], username: 'u1', credential: 'c1' } });
  }) as typeof fetch;
  const t = new TurnCredentials(STUN, { cloudflare: { keyId: 'key123', apiToken: 'tok' } }, fake);
  assert.equal(t.hasTurn(), false);
  await t.start();
  t.stop();
  assert.equal(calls, 1);
  assert.equal(t.hasTurn(), true);
  assert.deepEqual(t.current().map((s) => s.username ?? null), [null, 'u1'], 'STUN first, then TURN');
});

test('Metered: reads the credentials list; errors keep the last good credentials', async () => {
  let fail = false;
  const fake = (async (url: string | URL | Request) => {
    assert.equal(String(url), 'https://myapp.metered.live/api/v1/turn/credentials?apiKey=k%2B1');
    if (fail) return new Response('nope', { status: 500 });
    return Response.json([
      { urls: 'stun:stun.relay.metered.ca:80' },
      { urls: 'turn:global.relay.metered.ca:80', username: 'mu', credential: 'mc' },
    ]);
  }) as typeof fetch;
  const t = new TurnCredentials(STUN, { metered: { domain: 'https://myapp.metered.live/', apiKey: 'k+1' } }, fake);
  await t.start();
  assert.equal(t.hasTurn(), true);
  fail = true;
  await t.refresh();
  t.stop();
  assert.equal(t.hasTurn(), true, 'still has the earlier credentials');
  assert.match(t.lastError ?? '', /500/);
});

test('no provider: static config is used as-is', async () => {
  const t = new TurnCredentials([...STUN, { urls: ['turn:x'], username: 'a', credential: 'b' }], {});
  await t.start();
  t.stop();
  assert.equal(t.enabled, false);
  assert.equal(t.hasTurn(), true);
});
