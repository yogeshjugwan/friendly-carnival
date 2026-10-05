import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type { ActiveUser, CallRequestResult, ClientToServerEvents, IncomingCall, ServerToClientEvents } from '@rc/shared';
import { MemoryAccountStore, NO_PLUS } from './accounts.ts';
import { createApp } from './app.ts';
import { MemoryStore } from './store.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const once = <E extends keyof ServerToClientEvents>(s: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => s.once(e, ((x: never) => r(x)) as never));

test('Plus members see who is online and can call a waiting person, who can accept or decline', async () => {
  const accounts = new MemoryAccountStore();
  const app = createApp({ store: new MemoryStore(), accounts, statsIntervalMs: 60_000, limits: null });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const u = (await accounts.createUser('plus@example.com', 'h')) as { id: string };
  await accounts.setPlus(u.id, { ...NO_PLUS, status: 'admin', until: Date.now() + 86_400_000 });
  const plusToken = await accounts.createToken(u.id, 'session');

  const open: Client[] = [];
  const sock = async (deviceId: string, token?: string): Promise<Client> => {
    const s: Client = connect(url, { auth: { deviceId, token }, transports: ['websocket'], forceNew: true });
    open.push(s);
    await once(s, 'stats');
    return s;
  };
  const join = (s: Client, gender: 'male' | 'female', interests: string[] = []) => s.emit('queue:join', { gender, interests, mode: 'video' });
  const list = (s: Client) => new Promise<ActiveUser[] | null>((r) => s.emit('users:list', r));
  const call = (s: Client, id: string) => new Promise<CallRequestResult>((r) => s.emit('users:call', id, r));

  try {
    const plus = await sock('11111111-1111-4111-8111-111111111111', plusToken);
    const free = await sock('22222222-2222-4222-8222-222222222222');
    const her = await sock('33333333-3333-4333-8333-333333333333');

    assert.equal(await list(free), null, 'free users get no list');

    // The Plus member only browses (not in the random queue); she waits.
    plus.emit('queue:join', { gender: 'male', interests: ['music'], mode: 'video', browse: true });
    her.emit('queue:join', { gender: 'female', interests: ['music'], mode: 'video' });
    await once(her, 'queue:waiting');
    assert.equal(app.matchmaker.isWaiting(plus.id!), false, 'browsing is not searching');
    assert.equal(app.matchmaker.partnerOf(her.id!), undefined, 'she was not matched to the browser at random');

    // A free user asking to browse is simply queued.
    free.emit('queue:join', { gender: 'male', interests: [], mode: 'text', browse: true });
    await once(free, 'queue:waiting');

    const people = (await list(plus))!;
    const women = people.filter((p) => p.mode === 'video');
    assert.equal(women.length, 1, 'only others who joined; not the viewer');
    people.splice(0, people.length, ...women);
    assert.equal(people[0].gender, 'female');
    assert.equal(people[0].state, 'waiting');
    assert.equal(JSON.stringify(people).includes(her.id!), false, 'socket ids never leak');

    // First request: declined.
    const incoming1 = once(her, 'call:incoming');
    const sent1 = await call(plus, people[0].publicId);
    assert.equal(sent1.ok, true);
    const req1 = (await incoming1) as IncomingCall;
    assert.deepEqual(req1.from.sharedInterests, ['music']);
    assert.equal(req1.from.plus, true);
    const declined = once(plus, 'call:answered');
    her.emit('users:answer', req1.requestId, false);
    assert.deepEqual(await declined, { accepted: false, reason: 'declined' });

    // Second request: accepted → both get matched.
    const incoming2 = once(her, 'call:incoming');
    assert.equal((await call(plus, people[0].publicId)).ok, true);
    const req2 = (await incoming2) as IncomingCall;
    const answered = once(plus, 'call:answered');
    const matchedHer = once(her, 'match:found');
    const matchedPlus = once(plus, 'match:found');
    her.emit('users:answer', req2.requestId, true);
    assert.deepEqual(await answered, { accepted: true });
    await Promise.all([matchedHer, matchedPlus]);
    assert.equal(app.matchmaker.partnerOf(plus.id!)?.id, her.id);

    // While she is in a call she shows as busy and can't be called.
    const now = (await list(plus))!;
    assert.deepEqual(now.map((p) => p.mode), ['text'], 'his own partner is not listed; the free text user still is');
    const r = await call(plus, people[0].publicId);
    assert.equal(r.ok, false);
  } finally {
    for (const s of open) s.disconnect();
    await app.close();
  }
});
