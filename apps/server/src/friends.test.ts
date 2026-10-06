import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { newDb } from 'pg-mem';
import { io as connect, type Socket } from 'socket.io-client';
import type { CallRequestResult, ClientToServerEvents, Friend, FriendState, IncomingCall, ServerToClientEvents } from '@rc/shared';
import { MemoryAccountStore, PostgresAccountStore, type AccountStore } from './accounts.ts';
import { createApp } from './app.ts';
import { MemoryStore } from './store.ts';

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
  describe(`${name} friends`, () => {
    test('add, list, rename, remove both ways', async () => {
      const s = await make();
      await s.addFriend('a', 'b', { gender: 'female', country: 'VN' });
      await s.addFriend('b', 'a', { gender: 'male', country: 'IN' });
      assert.equal(await s.isFriend('a', 'b'), true);
      await s.renameFriend('a', 'b', 'Lan');
      const [f] = await s.listFriends('a');
      assert.equal(f.friendId, 'b');
      assert.equal(f.nickname, 'Lan');
      assert.equal(f.country, 'VN');
      await s.removeFriendship('b', 'a');
      assert.equal(await s.isFriend('a', 'b'), false);
      assert.equal(await s.isFriend('b', 'a'), false);
    });
  });
}

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const once = <E extends keyof ServerToClientEvents>(s: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => s.once(e, ((x: never) => r(x)) as never));

test('both tap ❤️ → friends; later one browses and the other calls them; guests are told to log in', async () => {
  const accounts = new MemoryAccountStore();
  const app = createApp({ store: new MemoryStore(), accounts, statsIntervalMs: 60_000, limits: null });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const token = async (email: string) => {
    const u = (await accounts.createUser(email, 'h')) as { id: string };
    return accounts.createToken(u.id, 'session');
  };
  const [ta, tb] = [await token('a@example.com'), await token('b@example.com')];
  const open: Client[] = [];
  const sock = async (deviceId: string, t?: string): Promise<Client> => {
    const s: Client = connect(url, { auth: { deviceId, token: t }, transports: ['websocket'], forceNew: true });
    open.push(s);
    await once(s, 'stats');
    return s;
  };
  const join = (s: Client, gender: 'male' | 'female', browse = false) => s.emit('queue:join', { gender, interests: [], mode: 'video', browse });
  const list = (s: Client) => new Promise<Friend[] | null>((r) => s.emit('friends:list', r));
  try {
    const a = await sock('11111111-1111-4111-8111-111111111111', ta);
    const b = await sock('22222222-2222-4222-8222-222222222222', tb);
    const guest = await sock('33333333-3333-4333-8333-333333333333');

    join(a, 'male');
    await once(a, 'queue:waiting');
    join(b, 'female');
    await once(b, 'match:found');

    const bHears = once(b, 'friend:state');
    a.emit('friend:add');
    assert.equal((await once(a, 'friend:state')) as FriendState, 'requested');
    assert.equal((await bHears) as FriendState, 'they-requested');
    const aHears = once(a, 'friend:state');
    b.emit('friend:add');
    assert.equal((await once(b, 'friend:state')) as FriendState, 'friends');
    assert.equal((await aHears) as FriendState, 'friends');

    const aFriends = (await list(a))!;
    assert.equal(aFriends.length, 1);
    assert.equal(aFriends[0].gender, 'female');
    assert.equal(aFriends[0].status, 'in-call');
    assert.equal(JSON.stringify(aFriends).includes('b@example.com'), false, 'no emails');
    assert.equal(await list(guest), null, 'guests have no friends list');

    // End the call; b just browses (not searching), a calls b from the Friends list.
    a.emit('queue:leave');
    await once(b, 'partner:left');
    join(b, 'female', true);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal((await list(a))![0].status, 'available');
    const incoming = once(b, 'call:incoming');
    const sent = await new Promise<CallRequestResult>((r) => a.emit('friends:call', aFriends[0].id, r));
    assert.equal(sent.ok, true);
    const call = (await incoming) as IncomingCall;
    assert.equal(call.friend, '', 'marked as a friend call');
    const matched = once(a, 'match:found');
    b.emit('users:answer', call.requestId, true);
    await matched;

    // Rename and remove.
    assert.equal(await new Promise<boolean>((r) => a.emit('friends:rename', aFriends[0].id, '  Lan  ', r)), true);
    assert.equal((await list(a))![0].nickname, 'Lan');
    assert.equal(await new Promise<boolean>((r) => a.emit('friends:remove', aFriends[0].id, r)), true);
    assert.deepEqual(await list(b), [], 'removed for both');

    // A guest tapping ❤️ is asked to log in.
    a.emit('queue:leave');
    join(guest, 'male');
    await once(guest, 'queue:waiting');
    join(a, 'male');
    await once(a, 'match:found');
    guest.emit('friend:add');
    assert.equal((await once(guest, 'friend:state')) as FriendState, 'login-required');
    a.emit('friend:add');
    assert.equal((await once(a, 'friend:state')) as FriendState, 'partner-guest');
  } finally {
    for (const s of open) s.disconnect();
    await app.close();
  }
});
