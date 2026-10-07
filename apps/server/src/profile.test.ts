import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@rc/shared';
import { createApp } from './app.ts';
import { MemoryStore } from './store.ts';
import { parseProfile, parseSettings } from './validate.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const once = <E extends keyof ServerToClientEvents>(s: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => s.once(e, ((x: never) => r(x)) as never));

test('profile cards are cleaned: listed avatars only, short bios, no links or handles', () => {
  assert.deepEqual(parseProfile({ avatar: '🦊', bio: '  Chai lover \n learning guitar ' }), { avatar: '🦊', bio: 'Chai lover learning guitar' });
  assert.deepEqual(parseProfile({ avatar: '💩', bio: 'x'.repeat(200) }), { avatar: null, bio: 'x'.repeat(80) });
  assert.equal(parseProfile({ bio: 'follow me insta: @cutie' }).bio, '');
  assert.deepEqual(parseProfile(null), { avatar: null, bio: '' });
  const s = parseSettings({ gender: 'male', interests: [], allowReconnect: true, hideCountry: false, avatar: '🐼', bio: 'hello' });
  assert.equal(s?.avatar, '🐼');
  assert.equal(s?.bio, 'hello');
});

test('your partner sees your avatar and bio', async () => {
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
    const a = await sock(1);
    const b = await sock(2);
    a.emit('profile:set', { avatar: '🦄', bio: 'Ask me about cricket' });
    a.emit('queue:join', { gender: 'male', interests: [], mode: 'text' });
    await once(a, 'queue:waiting');
    const [ma, mb] = [once(a, 'match:found'), once(b, 'match:found')];
    b.emit('queue:join', { gender: 'female', interests: [], mode: 'text' });
    const seenByB = await mb;
    assert.equal(seenByB.partner.avatar, '🦄');
    assert.equal(seenByB.partner.bio, 'Ask me about cricket');
    assert.equal((await ma).partner.avatar, undefined, 'no profile set: nothing extra');
  } finally {
    for (const s of open) s.disconnect();
    await app.close();
  }
});
