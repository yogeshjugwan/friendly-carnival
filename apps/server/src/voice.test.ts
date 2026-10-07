import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@rc/shared';
import { createApp } from './app.ts';
import { MemoryStore } from './store.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const once = <E extends keyof ServerToClientEvents>(s: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => s.once(e, ((x: never) => r(x)) as never));

test('voice-only users are matched with each other, not with video users', async () => {
  const app = createApp({ store: new MemoryStore(), statsIntervalMs: 60_000, limits: null });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const open: Client[] = [];
  const sock = async (n: number): Promise<Client> => {
    const s: Client = connect(url, { auth: { deviceId: `${n}0000000-1111-4111-8111-111111111111` }, transports: ['websocket'], forceNew: true });
    open.push(s);
    await once(s, 'stats');
    return s;
  };
  try {
    const video = await sock(1);
    video.emit('queue:join', { gender: 'male', interests: [], mode: 'video' });
    await once(video, 'queue:waiting');

    const v1 = await sock(2);
    v1.emit('queue:join', { gender: 'female', interests: [], mode: 'voice' });
    await once(v1, 'queue:waiting');

    const v2 = await sock(3);
    const m = once(v1, 'match:found');
    v2.emit('queue:join', { gender: 'male', interests: [], mode: 'voice' });
    const found = await m;
    assert.equal(found.mode, 'voice');
    assert.equal(app.matchmaker.partnerOf(video.id!), undefined, 'the video user is still waiting');
  } finally {
    for (const s of open) s.disconnect();
    await app.close();
  }
});
