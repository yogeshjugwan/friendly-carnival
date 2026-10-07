import { describe, test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { newDb } from 'pg-mem';
import { io as connect, type Socket } from 'socket.io-client';
import type { BanInfo, ClientToServerEvents, MatchFound, ServerToClientEvents } from '@rc/shared';
import { hashPassword, MemoryAccountStore, PostgresAccountStore, verifyPassword, type AccountStore } from './accounts.ts';
import { createApp, type App } from './app.ts';
import type { Mail, Mailer } from './mailer.ts';
import { MemoryStore } from './store.ts';

test('passwords hash with a random salt and verify', async () => {
  const a = await hashPassword('correct horse');
  const b = await hashPassword('correct horse');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('correct horse', a), true);
  assert.equal(await verifyPassword('wrong', a), false);
  assert.equal(await verifyPassword('x', 'garbage'), false);
});

const stores: [string, () => Promise<AccountStore>][] = [
  ['MemoryAccountStore', async () => new MemoryAccountStore()],
  [
    'PostgresAccountStore (pg-mem)',
    async () => {
      const { Pool } = newDb().adapters.createPg();
      const s = new PostgresAccountStore(new Pool());
      await s.init();
      return s;
    },
  ],
];

for (const [name, make] of stores) {
  describe(name, () => {
    test('users are unique by normalized email; settings persist', async () => {
      const s = await make();
      const u = await s.createUser(' Me@Example.com ', 'h');
      assert.notEqual(u, 'exists');
      assert.equal(await s.createUser('me@example.COM', 'h'), 'exists');
      const id = (u as Exclude<typeof u, 'exists'>).id;
      assert.equal((await s.userByEmail('ME@example.com'))?.id, id);
      await s.updateSettings(id, { gender: 'female', interests: ['music'], allowReconnect: false, hideCountry: true, filters: { gender: 'any', country: 'any' } });
      assert.deepEqual((await s.userById(id))?.settings.interests, ['music']);
      await s.markVerified(id);
      assert.equal((await s.userById(id))?.emailVerified, true);
    });

    test('session tokens are reusable, one-time tokens are consumed, kinds do not mix', async () => {
      const s = await make();
      const u = (await s.createUser('t@example.com', 'h')) as { id: string };
      const session = await s.createToken(u.id, 'session');
      assert.equal((await s.useToken(session, 'session'))?.id, u.id);
      assert.equal((await s.useToken(session, 'session'))?.id, u.id);
      assert.equal(await s.useToken(session, 'reset'), null);
      const reset = await s.createToken(u.id, 'reset');
      assert.equal((await s.useToken(reset, 'reset'))?.id, u.id);
      assert.equal(await s.useToken(reset, 'reset'), null, 'consumed');
      await s.deleteTokensFor(u.id, 'session');
      assert.equal(await s.useToken(session, 'session'), null);
      await s.deleteUser(u.id);
      assert.equal(await s.userById(u.id), null);
    });
  });
}

class CaptureMailer implements Mailer {
  sent: Mail[] = [];
  async send(mail: Mail) {
    this.sent.push(mail);
  }
  /** The token from the last link sent to an address. */
  lastToken(to: string) {
    const mail = [...this.sent].reverse().find((m) => m.to === to);
    return mail?.text.match(/token=([^\s]+)/)?.[1] ?? null;
  }
}

describe('auth HTTP API and sockets', () => {
  let app: App;
  let url: string;
  const mailer = new CaptureMailer();
  const clients: Socket[] = [];

  before(async () => {
    app = createApp({ statsIntervalMs: 60_000, store: new MemoryStore(), mailer, adminToken: 'adm', webUrl: 'https://rc.test' });
    await new Promise<void>((r) => app.http.listen(0, r));
    url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  });
  after(async () => {
    clients.forEach((c) => c.disconnect());
    await app.close();
  });

  const post = (path: string, body: unknown, token?: string) =>
    fetch(url + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });

  test('signup → verify email → login → settings → password change → delete', async () => {
    const email = `user-${randomUUID().slice(0, 6)}@example.com`;
    assert.equal((await post('/auth/signup', { email, password: 'short' })).status, 400);
    assert.equal((await post('/auth/signup', { email: 'not-an-email', password: 'long enough' })).status, 400);

    const signup = await post('/auth/signup', { email, password: 'first password' });
    assert.equal(signup.status, 201);
    const { token, user } = await signup.json();
    assert.equal(user.emailVerified, false);
    assert.equal((await post('/auth/signup', { email: email.toUpperCase(), password: 'first password' })).status, 409);

    const link = mailer.sent.at(-1)!;
    assert.match(link.text, /^Welcome/);
    assert.ok(link.text.includes('https://rc.test/verify?token='));
    assert.equal((await post('/auth/verify', { token: mailer.lastToken(email) })).status, 200);
    assert.equal((await post('/auth/verify', { token: mailer.lastToken(email) })).status, 400, 'one-time link');

    const me = await fetch(url + '/auth/me', { headers: { authorization: `Bearer ${token}` } });
    assert.equal((await me.json()).emailVerified, true);
    assert.equal((await fetch(url + '/auth/me')).status, 401);

    assert.equal((await post('/auth/login', { email, password: 'nope nope' })).status, 401);
    assert.equal((await post('/auth/login', { email: 'ghost@example.com', password: 'nope nope' })).status, 401);
    const login = await post('/auth/login', { email, password: 'first password' });
    assert.equal(login.status, 200);
    const session2 = (await login.json()).token;

    const settings = { gender: 'female', interests: ['Music', ' chess '], allowReconnect: false, hideCountry: true };
    const saved = await (await post('/auth/settings', { settings }, session2)).json();
    assert.deepEqual(saved.settings, {
      gender: 'female',
      interests: ['music', 'chess'],
      allowReconnect: false,
      hideCountry: true,
      filters: { gender: 'any', country: 'any' },
      avatar: null,
      bio: '',
    });
    assert.equal((await post('/auth/settings', { settings: { gender: 'robot' } }, session2)).status, 400);

    assert.equal((await post('/auth/password', { current: 'wrong', next: 'second password' }, session2)).status, 400);
    assert.equal((await post('/auth/password', { current: 'first password', next: 'second password' }, session2)).status, 200);
    assert.equal((await post('/auth/login', { email, password: 'second password' })).status, 200);

    assert.equal((await post('/auth/logout', {}, session2)).status, 200);
    assert.equal((await post('/auth/settings', { settings }, session2)).status, 401, 'logged out');

    assert.equal((await post('/auth/delete', { password: 'wrong' }, token)).status, 400);
    assert.equal((await post('/auth/delete', { password: 'second password' }, token)).status, 200);
    assert.equal((await post('/auth/login', { email, password: 'second password' })).status, 401, 'account gone');
  });

  test('forgot password: same reply for unknown emails, reset signs out everywhere', async () => {
    const email = `reset-${randomUUID().slice(0, 6)}@example.com`;
    const { token } = await (await post('/auth/signup', { email, password: 'old password' })).json();
    const before = mailer.sent.length;
    assert.equal((await post('/auth/forgot', { email: 'nobody@example.com' })).status, 200);
    assert.equal(mailer.sent.length, before, 'no email for unknown address');
    assert.equal((await post('/auth/forgot', { email })).status, 200);
    const resetToken = mailer.lastToken(email)!;
    assert.ok(mailer.sent.at(-1)!.text.includes('/reset?token='));

    assert.equal((await post('/auth/reset', { token: resetToken, password: 'x' })).status, 400);
    assert.equal((await post('/auth/reset', { token: resetToken, password: 'new password!' })).status, 200);
    assert.equal((await fetch(url + '/auth/me', { headers: { authorization: `Bearer ${token}` } })).status, 401);
    assert.equal((await post('/auth/login', { email, password: 'new password!' })).status, 200);
  });

  test('a ban on an account follows the user to a new device; hidden country is hidden', async () => {
    const email = `ban-${randomUUID().slice(0, 6)}@example.com`;
    const { token } = await (await post('/auth/signup', { email, password: 'some password' })).json();
    type C = Socket<ServerToClientEvents, ClientToServerEvents>;
    const sock = async (auth: object): Promise<C> => {
      const c: C = connect(url, { transports: ['websocket'], forceNew: true, auth });
      clients.push(c);
      await new Promise<void>((r) => c.once('connect', () => r()));
      return c;
    };
    const once = <E extends keyof ServerToClientEvents>(c: C, e: E) =>
      new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => c.once(e, ((x: never) => r(x)) as never));

    const user = await sock({ deviceId: randomUUID(), token });
    const waiting = once(user, 'queue:waiting');
    user.emit('queue:join', { gender: 'male', interests: [], mode: 'video', hideCountry: true });
    await waiting;
    const other = await sock({ deviceId: randomUUID() });
    const seen = once(other, 'match:found');
    other.emit('queue:join', { gender: 'male', interests: [], mode: 'video' });
    const match = (await seen) as MatchFound;
    assert.equal(match.partner.locationHidden, true);
    assert.equal(match.partner.country, null);

    const received = once(other, 'report:received');
    other.emit('report:submit', { target: 'current', reason: 'harassment', source: 'user' });
    await received;
    const [report] = await (await fetch(url + '/admin/reports?status=open', { headers: { authorization: 'Bearer adm' } })).json();
    assert.equal(report.targetUserId !== null, true, 'report knows the account');
    const kicked = once(user, 'banned');
    await post(`/admin/reports/${report.id}/action`, { action: 'ban', durationHours: 24 }, 'adm');
    await kicked;

    // Same account, brand-new device id: still banned.
    const elsewhere = await sock({ deviceId: randomUUID(), token });
    const banned = once(elsewhere, 'banned');
    elsewhere.emit('queue:join', { gender: 'male', interests: [], mode: 'video' });
    assert.ok(((await banned) as BanInfo).expiresAt! > Date.now());
  });
});
