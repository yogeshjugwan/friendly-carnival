import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { ROOM_SIZE, type ClientToServerEvents, type RoomJoinResult, type ServerToClientEvents } from '@rc/shared';
import { MemoryAccountStore } from './accounts.ts';
import { createApp } from './app.ts';
import { MemoryStore } from './store.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const once = <E extends keyof ServerToClientEvents>(s: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => s.once(e, ((x: never) => r(x)) as never));
const ask = <T,>(fn: (cb: (r: T) => void) => void) => new Promise<T>((r) => fn(r));

test('group rooms: logged-in only, up to 4 per room, signaling and chat stay inside the room', async () => {
  const accounts = new MemoryAccountStore();
  const app = createApp({ store: new MemoryStore(), accounts, statsIntervalMs: 60_000, limits: null });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const open: Client[] = [];
  let n = 0;
  const sock = async (loggedIn = true): Promise<Client> => {
    n++;
    let token: string | undefined;
    if (loggedIn) {
      const u = (await accounts.createUser(`u${n}@example.com`, 'h')) as { id: string };
      token = await accounts.createToken(u.id, 'session');
    }
    const s: Client = connect(url, { auth: { deviceId: `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`, ...(token ? { token } : {}) }, transports: ['websocket'], forceNew: true });
    open.push(s);
    await once(s, 'stats');
    return s;
  };
  const join = (s: Client, topic = 'music') => ask<RoomJoinResult>((cb) => s.emit('room:join', topic, 'video', 'female', cb));
  try {
    const guest = await sock(false);
    assert.deepEqual(await join(guest), { ok: false, reason: 'login-required' });

    const people = await Promise.all(Array.from({ length: ROOM_SIZE + 1 }, () => sock()));
    const first = await join(people[0]!);
    assert.ok(first.ok && first.members.length === 0);
    const joined = once(people[0]!, 'room:member-joined');
    const second = await join(people[1]!);
    assert.ok(second.ok && second.roomId === first.roomId && second.members.length === 1);
    const seen = await joined;
    assert.ok(second.ok && seen.id === second.you);
    assert.equal(JSON.stringify(second).includes(people[0]!.id!), false, 'socket ids never leak');

    await join(people[2]!);
    await join(people[3]!);
    const fifth = await join(people[4]!);
    assert.ok(first.ok && fifth.ok && fifth.roomId !== first.roomId && fifth.members.length === 0, 'a full room starts a new one');

    // Signaling reaches only the addressed member of the same room.
    const sig = once(people[0]!, 'room:signal');
    people[1]!.emit('room:signal', first.ok ? first.you : '', { kind: 'offer', sdp: 'v=0' });
    assert.deepEqual(await sig, { from: second.ok ? second.you : '', msg: { kind: 'offer', sdp: 'v=0' } });

    // Chat goes to everyone in the room; links are refused.
    const chat = once(people[2]!, 'room:chat');
    people[0]!.emit('room:chat', 'hi all!');
    assert.equal((await chat).text, 'hi all!');
    const rejected = once(people[0]!, 'chat:rejected');
    people[0]!.emit('room:chat', 'join t.me/spam');
    assert.equal(await rejected, 'link');

    const counts = await ask<Record<string, number>>((cb) => people[0]!.emit('rooms:list', cb));
    assert.deepEqual(counts, { music: 5 });

    const left = once(people[0]!, 'room:member-left');
    people[1]!.emit('room:leave');
    assert.equal(await left, second.ok ? second.you : '');
  } finally {
    for (const s of open) s.disconnect();
    await app.close();
  }
});
