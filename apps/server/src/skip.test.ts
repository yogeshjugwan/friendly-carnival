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

test('call:skip leaves the partner without searching; the ad-first client joins afterwards', async () => {
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
  const join = (s: Client) => s.emit('queue:join', { gender: 'male', interests: [], mode: 'video' });
  try {
    const a = await sock('11111111-1111-4111-8111-111111111111');
    const b = await sock('22222222-2222-4222-8222-222222222222');
    join(a);
    await once(a, 'queue:waiting');
    join(b);
    await once(b, 'match:found');

    const left = once(a, 'partner:left');
    b.emit('call:skip');
    assert.equal(await left, 'next');
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(app.matchmaker.waitingCount, 0, 'nobody is searching yet');
    assert.ok(!app.matchmaker.partnerOf(b.id!), 'b has no partner');

    // After the ad, b searches and can meet someone new.
    const c = await sock('33333333-3333-4333-8333-333333333333');
    join(c);
    await once(c, 'queue:waiting');
    join(b);
    await once(b, 'match:found');
  } finally {
    for (const s of open) s.disconnect();
    await app.close();
  }
});
