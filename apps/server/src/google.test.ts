import { describe, test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { MemoryAccountStore } from './accounts.ts';
import { createApp, type App } from './app.ts';
import { MemoryStore } from './store.ts';

const WEB = 'https://web.example';

/** Stands in for Google's token and userinfo endpoints. */
function fakeGoogle(profile: { email: string; email_verified: boolean }) {
  const calls: string[] = [];
  const fake = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('oauth2.googleapis.com/token')) {
      const body = new URLSearchParams(String(init?.body));
      if (body.get('code') !== 'good-code' || body.get('client_secret') !== 'secret') return new Response('{}', { status: 400 });
      return Response.json({ access_token: 'at' });
    }
    if (url.includes('/userinfo')) return Response.json(profile);
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { fake, calls };
}

describe('Continue with Google', () => {
  let app: App;
  let base = '';
  const accounts = new MemoryAccountStore();
  const google = fakeGoogle({ email: 'New.Person@Gmail.com', email_verified: true });

  before(async () => {
    app = createApp({
      store: new MemoryStore(),
      accounts,
      webUrl: WEB,
      webOrigins: [WEB],
      statsIntervalMs: 60_000,
      google: { clientId: 'cid', clientSecret: 'secret' },
      serverUrl: 'https://api.example',
      googleFetch: google.fake,
    });
    await new Promise<void>((r) => app.http.listen(0, r));
    base = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  });
  after(() => app.close());

  const get = (path: string) => fetch(base + path, { redirect: 'manual' });
  const start = async (next = '/plus') => {
    const res = await get(`/auth/google/start?next=${encodeURIComponent(next)}`);
    assert.equal(res.status, 302);
    const to = new URL(res.headers.get('location')!);
    assert.equal(to.origin + to.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.equal(to.searchParams.get('redirect_uri'), 'https://api.example/auth/google/callback');
    assert.equal(to.searchParams.get('client_id'), 'cid');
    return to.searchParams.get('state')!;
  };

  test('providers endpoint says Google is on', async () => {
    assert.deepEqual(await (await get('/auth/providers')).json(), { google: true });
  });

  test('first sign-in creates a verified account and hands the web app a session', async () => {
    const state = await start('/plus');
    const res = await get(`/auth/google/callback?state=${state}&code=good-code`);
    assert.equal(res.status, 302);
    const to = new URL(res.headers.get('location')!);
    assert.equal(to.origin + to.pathname, `${WEB}/auth/google`);
    const frag = new URLSearchParams(to.hash.slice(1));
    assert.equal(frag.get('next'), '/plus');
    assert.equal(frag.get('new'), '1');
    const me = await fetch(`${base}/auth/me`, { headers: { authorization: `Bearer ${frag.get('token')}` } });
    const user = await me.json();
    assert.equal(user.email, 'new.person@gmail.com');
    assert.equal(user.emailVerified, true);
  });

  test('second sign-in logs into the same account', async () => {
    const before = await accounts.userByEmail('new.person@gmail.com');
    const state = await start('/');
    const res = await get(`/auth/google/callback?state=${state}&code=good-code`);
    const frag = new URLSearchParams(new URL(res.headers.get('location')!).hash.slice(1));
    assert.equal(frag.get('new'), null);
    const me = await (await fetch(`${base}/auth/me`, { headers: { authorization: `Bearer ${frag.get('token')}` } })).json();
    assert.equal(me.id, before?.id);
  });

  test('bad or reused state, bad code and unsafe next are refused', async () => {
    const unknown = await get('/auth/google/callback?state=nope&code=good-code');
    assert.equal(unknown.headers.get('location'), `${WEB}/login?error=expired`);

    const state = await start('//evil.example');
    const badCode = await get(`/auth/google/callback?state=${state}&code=bad`);
    assert.equal(badCode.headers.get('location'), `${WEB}/login?error=google_failed`);
    const reused = await get(`/auth/google/callback?state=${state}&code=good-code`);
    assert.equal(reused.headers.get('location'), `${WEB}/login?error=expired`, 'state is single-use');

    const s2 = await start('//evil.example');
    const ok = await get(`/auth/google/callback?state=${s2}&code=good-code`);
    assert.equal(new URLSearchParams(new URL(ok.headers.get('location')!).hash.slice(1)).get('next'), '/');
  });
});

test('unverified Google emails are refused, and Google is off without keys', async () => {
  const google = fakeGoogle({ email: 'x@example.com', email_verified: false });
  const on = createApp({ store: new MemoryStore(), webUrl: WEB, statsIntervalMs: 60_000, google: { clientId: 'c', clientSecret: 'secret' }, googleFetch: google.fake });
  const off = createApp({ store: new MemoryStore(), webUrl: WEB, statsIntervalMs: 60_000, google: null });
  await new Promise<void>((r) => on.http.listen(0, r));
  await new Promise<void>((r) => off.http.listen(0, r));
  try {
    const onBase = `http://localhost:${(on.http.address() as AddressInfo).port}`;
    const state = new URL((await fetch(`${onBase}/auth/google/start`, { redirect: 'manual' })).headers.get('location')!).searchParams.get('state');
    const res = await fetch(`${onBase}/auth/google/callback?state=${state}&code=good-code`, { redirect: 'manual' });
    assert.equal(res.headers.get('location'), `${WEB}/login?error=unverified`);

    const offBase = `http://localhost:${(off.http.address() as AddressInfo).port}`;
    assert.deepEqual(await (await fetch(`${offBase}/auth/providers`)).json(), { google: false });
    const disabled = await fetch(`${offBase}/auth/google/start`, { redirect: 'manual' });
    assert.equal(disabled.headers.get('location'), `${WEB}/login?error=google_disabled`);
  } finally {
    await on.close();
    await off.close();
  }
});
