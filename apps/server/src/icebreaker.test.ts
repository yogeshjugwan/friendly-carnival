import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { ICEBREAKERS, type ClientToServerEvents, type ServerToClientEvents } from '@rc/shared';
import { createApp } from './app.ts';
import { MemoryStore } from './store.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const once = <E extends keyof ServerToClientEvents>(s: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => s.once(e, ((x: never) => r(x)) as never));

test('an icebreaker reaches both people, and is rate-limited', async () => {
  const app = createApp({ store: new MemoryStore(), statsIntervalMs: 60_000, limits: null });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const open: Client[] = [];
  const sock = async (deviceId: string): Promise<Client> => {
    const s: Client = connect(url, { auth: { deviceId }, transports: ['websocket'], forceNew: true });
    open.push(s);
    await once(s, 'stats');
    return s;
  };
  try {
    const a = await sock('11111111-1111-4111-8111-111111111111');
    const b = await sock('22222222-2222-4222-8222-222222222222');
    a.emit('queue:join', { gender: 'male', interests: [], mode: 'text' });
    await once(a, 'queue:waiting');
    b.emit('queue:join', { gender: 'female', interests: [], mode: 'text' });
    await once(b, 'match:found');

    const [qa, qb] = [once(a, 'icebreaker'), once(b, 'icebreaker')];
    a.emit('icebreaker');
    const [x, y] = await Promise.all([qa, qb]);
    assert.equal(x, y, 'same question for both');
    assert.ok((ICEBREAKERS as readonly string[]).includes(x as string));

    let extra = 0;
    b.on('icebreaker', () => extra++);
    a.emit('icebreaker');
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(extra, 0, 'second request within 4 s is ignored');
  } finally {
    for (const s of open) s.disconnect();
    await app.close();
  }
});
