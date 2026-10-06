import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, PushPayload, PushSubscriptionJSON, ServerToClientEvents } from '@rc/shared';
import { MemoryAccountStore } from './accounts.ts';
import { createApp } from './app.ts';
import { PushService, type PushSender } from './push.ts';
import { MemoryStore } from './store.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const once = <E extends keyof ServerToClientEvents>(s: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => s.once(e, ((x: never) => r(x)) as never));

const sub = (n: number): PushSubscriptionJSON => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: 'BKey' + n, auth: 'auth' + n } });

test('push: VAPID keys are made once and kept; gone subscriptions are dropped', async () => {
  const accounts = new MemoryAccountStore();
  const a = new PushService(accounts, 'https://example.com');
  const b = new PushService(accounts, 'https://example.com');
  const key = await a.publicKey();
  assert.ok(key && key.length > 40);
  assert.equal(await b.publicKey(), key, 'second instance reuses the stored keys');

  const u = (await accounts.createUser('p@example.com', 'h')) as { id: string };
  await accounts.addPushSubscription(u.id, sub(1));
  await accounts.addPushSubscription(u.id, sub(2));
  const sender: PushSender = async (s) => {
    if (s.endpoint.endsWith('/2')) throw Object.assign(new Error('gone'), { statusCode: 410 });
  };
  const c = new PushService(accounts, 'https://example.com', sender);
  assert.equal(await c.send(u.id, { title: 't', body: 'b', url: '/' }), 1);
  assert.deepEqual((await accounts.pushSubscriptions(u.id)).map((s) => s.endpoint), ['https://push.example/1']);
});

test('push: friends who are away hear when you come online (with their nickname), not on every reconnect', async () => {
  const accounts = new MemoryAccountStore();
  const sent: { endpoint: string; payload: PushPayload }[] = [];
  const pushSender: PushSender = async (s, body) => void sent.push({ endpoint: s.endpoint, payload: JSON.parse(body) });
  const app = createApp({ store: new MemoryStore(), accounts, statsIntervalMs: 60_000, limits: null, pushSender, webUrl: 'https://example.com' });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const open: Client[] = [];
  try {
    const me = (await accounts.createUser('me@example.com', 'h')) as { id: string };
    const pal = (await accounts.createUser('pal@example.com', 'h')) as { id: string };
    await accounts.addFriend(me.id, pal.id, { gender: null, country: null });
    await accounts.addFriend(pal.id, me.id, { gender: null, country: null });
    await accounts.renameFriend(pal.id, me.id, 'Sam');
    const palToken = await accounts.createToken(pal.id, 'session');

    const keyRes = await fetch(`${url}/auth/push/key`);
    assert.equal(keyRes.status, 200);
    assert.ok(((await keyRes.json()) as { publicKey: string }).publicKey);
    const subscribe = (body: unknown) =>
      fetch(`${url}/auth/push/subscribe`, { method: 'POST', headers: { authorization: `Bearer ${palToken}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await subscribe({ subscription: { endpoint: 'http://insecure', keys: { p256dh: 'x', auth: 'y' } } })).status, 400);
    assert.equal((await subscribe({ subscription: sub(7) })).status, 200);

    const meToken = await accounts.createToken(me.id, 'session');
    const join = async () => {
      const s: Client = connect(url, { auth: { deviceId: '11111111-1111-4111-8111-111111111111', token: meToken }, transports: ['websocket'], forceNew: true });
      open.push(s);
      await once(s, 'stats');
      await new Promise((r) => setTimeout(r, 100));
      return s;
    };
    const first = await join();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].endpoint, sub(7).endpoint);
    assert.equal(sent[0].payload.title, '❤️ A friend is online');
    assert.match(sent[0].payload.body, /^Sam is on randomCall/);

    first.disconnect();
    await join();
    assert.equal(sent.length, 1, 'no second push right after a reconnect');
  } finally {
    for (const s of open) s.disconnect();
    await app.close();
  }
});

test('push subscriptions in Postgres (pg-mem)', async () => {
  const { newDb } = await import('pg-mem');
  const { PostgresAccountStore } = await import('./accounts.ts');
  const { Pool } = newDb().adapters.createPg();
  const accounts = new PostgresAccountStore(new Pool());
  await accounts.init();
  assert.equal(await accounts.initAppSecret('k', 'one'), 'one');
  assert.equal(await accounts.initAppSecret('k', 'two'), 'one');
  const u = (await accounts.createUser('s@example.com', 'h')) as { id: string };
  await accounts.addPushSubscription(u.id, sub(1));
  await accounts.addPushSubscription(u.id, sub(1));
  await accounts.addPushSubscription(u.id, sub(2));
  assert.equal((await accounts.pushSubscriptions(u.id)).length, 2);
  await accounts.removePushSubscription(sub(1).endpoint);
  assert.deepEqual(await accounts.pushSubscriptions(u.id), [sub(2)]);
});
