import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, MatchFound, ServerToClientEvents } from '@rc/shared';
import { createApp, type App } from './app.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let app: App;
let url: string;
const clients: Client[] = [];

before(async () => {
  app = createApp({ statsIntervalMs: 60_000 });
  await new Promise<void>((resolve) => app.http.listen(0, resolve));
  url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
});

after(async () => {
  clients.forEach((c) => c.disconnect());
  await app.close();
});

const client = async (): Promise<Client> => {
  const c: Client = connect(url, { transports: ['websocket'], forceNew: true });
  clients.push(c);
  await new Promise<void>((resolve) => c.once('connect', () => resolve()));
  return c;
};

const next = <E extends keyof ServerToClientEvents>(c: Client, event: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((resolve) =>
    c.once(event, ((arg: never) => resolve(arg)) as never),
  );

test('two strangers match, exchange signals, and Next ends the call', async () => {
  const alice = await client();
  const bob = await client();

  const aliceWaiting = next(alice, 'queue:waiting');
  alice.emit('queue:join', { gender: 'female', interests: ['Music'] });
  await aliceWaiting;

  const aliceMatch = next(alice, 'match:found');
  const bobMatch = next(bob, 'match:found');
  bob.emit('queue:join', { gender: 'male', interests: ['music', 'chess'] });
  const [a, b] = (await Promise.all([aliceMatch, bobMatch])) as [MatchFound, MatchFound];

  assert.equal(a.matchId, b.matchId);
  assert.equal(a.initiator, false);
  assert.equal(b.initiator, true);
  assert.equal(a.partner.gender, 'male');
  assert.deepEqual(b.partner.sharedInterests, ['music']);
  assert.ok(a.iceServers.length > 0);

  const offer = next(alice, 'signal');
  bob.emit('signal', { kind: 'offer', sdp: 'v=0 fake' });
  assert.deepEqual(await offer, { kind: 'offer', sdp: 'v=0 fake' });

  const left = next(alice, 'partner:left');
  const bobWaiting = next(bob, 'queue:waiting');
  bob.emit('call:next');
  assert.equal(await left, 'next');
  await bobWaiting;
  bob.emit('queue:leave');
});

test('invalid join is rejected, disconnect notifies partner', async () => {
  const carol = await client();
  const err = next(carol, 'error:message');
  carol.emit('queue:join', { gender: 'robot' } as never);
  assert.equal(await err, 'Invalid join request');

  const dave = await client();
  const carolWaiting = next(carol, 'queue:waiting');
  carol.emit('queue:join', { gender: 'male', interests: [] });
  await carolWaiting;
  const daveMatch = next(dave, 'match:found');
  dave.emit('queue:join', { gender: 'male', interests: [] });
  await daveMatch;

  const left = next(carol, 'partner:left');
  dave.disconnect();
  assert.equal(await left, 'disconnect');
});
