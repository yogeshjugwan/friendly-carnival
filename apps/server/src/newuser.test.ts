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

test('a device first seen a few minutes ago is marked new to its partner', async () => {
  let now = 1_000_000_000;
  const app = createApp({ store: new MemoryStore(), statsIntervalMs: 60_000, limits: null, now: () => now });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const open: Client[] = [];
  const sock = async (deviceId?: string): Promise<Client> => {
    const s: Client = connect(url, { auth: deviceId ? { deviceId } : {}, transports: ['websocket'], forceNew: true });
    open.push(s);
    await once(s, 'stats');
    return s;
  };
  try {
    // Seen right after boot: treated as an existing user reconnecting.
    const old = await sock('11111111-1111-4111-8111-111111111111');
    now += 5 * 60_000;
    const fresh = await sock('22222222-2222-4222-8222-222222222222');

    old.emit('queue:join', { gender: 'male', interests: [], mode: 'video' });
    await once(old, 'queue:waiting');
    const [mOld, mFresh] = [once(old, 'match:found'), once(fresh, 'match:found')];
    fresh.emit('queue:join', { gender: 'female', interests: [], mode: 'video' });
    const [a, b] = await Promise.all([mOld, mFresh]);
    assert.equal(a.partner.isNew, true, 'the fresh device is new to the old one');
    assert.equal(b.partner.isNew, false, 'the old device is not new');

    // A browser without an id is always new.
    fresh.emit('queue:leave');
    old.emit('queue:leave');
    const anon = await sock();
    old.emit('queue:join', { gender: 'male', interests: [], mode: 'video' });
    await once(old, 'queue:waiting');
    const m = once(old, 'match:found');
    anon.emit('queue:join', { gender: 'female', interests: [], mode: 'video' });
    assert.equal((await m).partner.isNew, true);
  } finally {
    for (const s of open) s.disconnect();
    await app.close();
  }
});
