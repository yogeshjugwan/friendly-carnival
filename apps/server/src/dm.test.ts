import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, DirectMessage, DmSendResult, Friend, PushPayload, ServerToClientEvents } from '@rc/shared';
import { MemoryAccountStore, PostgresAccountStore } from './accounts.ts';
import { createApp } from './app.ts';
import type { PushSender } from './push.ts';
import { MemoryStore } from './store.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const once = <E extends keyof ServerToClientEvents>(s: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => s.once(e, ((x: never) => r(x)) as never));
const ask = <T,>(fn: (cb: (r: T) => void) => void) => new Promise<T>((r) => fn(r));

test('friends can message each other; offline friends get it later (and a push)', async () => {
  const accounts = new MemoryAccountStore();
  const pushed: PushPayload[] = [];
  const pushSender: PushSender = async (_s, body) => void pushed.push(JSON.parse(body));
  const app = createApp({ store: new MemoryStore(), accounts, statsIntervalMs: 60_000, limits: null, pushSender, webUrl: 'https://example.com' });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const open: Client[] = [];
  const sock = async (n: number, token: string): Promise<Client> => {
    const s: Client = connect(url, { auth: { deviceId: `${n}0000000-1111-4111-8111-111111111111`, token }, transports: ['websocket'], forceNew: true });
    open.push(s);
    await once(s, 'stats');
    return s;
  };
  try {
    const a = (await accounts.createUser('a@example.com', 'h')) as { id: string };
    const b = (await accounts.createUser('b@example.com', 'h')) as { id: string };
    const stranger = (await accounts.createUser('c@example.com', 'h')) as { id: string };
    await accounts.addFriend(a.id, b.id, { gender: null, country: null });
    await accounts.addFriend(b.id, a.id, { gender: null, country: null });
    await accounts.renameFriend(b.id, a.id, 'Asha');
    await accounts.addPushSubscription(b.id, { endpoint: 'https://push.example/b', keys: { p256dh: 'k', auth: 'a' } });
    const [ta, tb, tc] = await Promise.all([a, b, stranger].map((u) => accounts.createToken(u.id, 'session')));

    const sa = await sock(1, ta!);
    const friendOfA = (await ask<Friend[] | null>((cb) => sa.emit('friends:list', cb)))![0]!;

    // B is offline: the message is kept and pushed.
    const sent = await ask<DmSendResult>((cb) => sa.emit('dm:send', friendOfA.id, 'hey, call later?', cb));
    assert.ok(sent.ok && sent.message.fromMe && sent.message.text === 'hey, call later?');
    await new Promise((r) => setTimeout(r, 50));
    const dmPushes = pushed.filter((p) => p.title.startsWith('💬'));
    assert.deepEqual(dmPushes.map((p) => [p.title, p.body]), [['💬 Asha', 'hey, call later?']]);

    // B comes online: unread count, history (marks read), live messages.
    const sb = await sock(2, tb!);
    const friendOfB = (await ask<Friend[] | null>((cb) => sb.emit('friends:list', cb)))![0]!;
    assert.equal(friendOfB.unread, 1);
    const history = (await ask<DirectMessage[] | null>((cb) => sb.emit('dm:history', friendOfB.id, cb)))!;
    assert.deepEqual(history.map((m) => [m.fromMe, m.text]), [[false, 'hey, call later?']]);
    assert.equal((await ask<Friend[] | null>((cb) => sb.emit('friends:list', cb)))![0]!.unread, 0);

    const live = once(sa, 'dm:new');
    await ask<DmSendResult>((cb) => sb.emit('dm:send', friendOfB.id, 'sure! 8pm', cb));
    const got = await live;
    assert.equal(got.friendId, friendOfA.id, "the sender's handle as A knows it");
    assert.equal(got.message.fromMe, false);

    // Not friends: refused.
    const sc = await sock(3, tc!);
    assert.deepEqual(await ask<DmSendResult>((cb) => sc.emit('dm:send', friendOfA.id, 'hi', cb)), { ok: false, reason: 'not-friends' });
  } finally {
    for (const s of open) s.disconnect();
    await app.close();
  }
});

test('friend messages in Postgres (pg-mem)', async () => {
  const { newDb } = await import('pg-mem');
  const { Pool } = newDb().adapters.createPg();
  const accounts = new PostgresAccountStore(new Pool());
  await accounts.init();
  await accounts.addMessage('a', 'b', 'one');
  await new Promise((r) => setTimeout(r, 2));
  await accounts.addMessage('b', 'a', 'two');
  await new Promise((r) => setTimeout(r, 2));
  await accounts.addMessage('a', 'b', 'three');
  assert.deepEqual((await accounts.messagesBetween('b', 'a', 2)).map((m) => m.text), ['two', 'three']);
  assert.equal((await accounts.unreadCounts('b')).get('a'), 2);
  await accounts.markRead('b', 'a');
  assert.equal((await accounts.unreadCounts('b')).get('a'), undefined);
  await accounts.removeFriendship('a', 'b');
  assert.equal((await accounts.messagesBetween('a', 'b', 10)).length, 0);
});
