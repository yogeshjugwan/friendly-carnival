import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { leadingZeroBits, type ClientToServerEvents, type GuardChallenge, type ServerToClientEvents } from '@rc/shared';
import { MemoryAccountStore, NO_PLUS } from './accounts.ts';
import { createApp } from './app.ts';
import { Guard, looksLikeLink, powBits } from './guard.ts';
import { MemoryStore } from './store.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const once = <E extends keyof ServerToClientEvents>(s: Client, e: E, ms = 3000) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r, j) => {
    const t = setTimeout(() => j(new Error(`timeout waiting for ${String(e)}`)), ms);
    s.once(e, ((x: never) => (clearTimeout(t), r(x))) as never);
  });
const never = (s: Client, e: keyof ServerToClientEvents, ms = 300) =>
  new Promise<boolean>((r) => {
    const t = setTimeout(() => r(true), ms);
    s.once(e, (() => (clearTimeout(t), r(false))) as never);
  });

const solve = ({ challenge, bits }: GuardChallenge) => {
  for (let i = 0; ; i++) {
    const nonce = i.toString(36);
    if (leadingZeroBits(createHash('sha256').update(`${challenge}:${nonce}`).digest()) >= bits) return nonce;
  }
};
const uuid = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;

async function setup(opts: Parameters<typeof createApp>[0] = { store: new MemoryStore() }) {
  const app = createApp({ statsIntervalMs: 60_000, limits: null, ...opts });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const open: Client[] = [];
  const sock = async (deviceId?: string, token?: string): Promise<Client> => {
    const s: Client = connect(url, { auth: { ...(deviceId ? { deviceId } : {}), ...(token ? { token } : {}) }, transports: ['websocket'], forceNew: true, reconnection: false });
    open.push(s);
    await once(s, 'stats');
    return s;
  };
  return { app, url, sock, close: async () => (open.forEach((s) => s.disconnect()), await app.close()) };
}

test('guard: proof of work is checked, single-use and harder for busy IPs', () => {
  const g = new Guard({ baseBits: 8 });
  const c = g.challenge('ip:a');
  assert.equal(c.bits, 8);
  assert.equal(g.verify(c.challenge, 'definitely-wrong-nonce-zz'), leadingZeroBits(createHash('sha256').update(`${c.challenge}:definitely-wrong-nonce-zz`).digest()) >= 8);
  const nonce = solve(c);
  assert.equal(g.verify(c.challenge, nonce), true);
  assert.equal(g.verify(c.challenge, nonce), false, 'single use');
  assert.equal(g.verify(c.challenge.replace(/\.8\./, '.1.'), nonce), false, 'tampered difficulty');
  assert.equal(new Guard().verify(c.challenge, nonce), false, 'another server secret');
  assert.deepEqual([powBits(0), powBits(30), powBits(100), powBits(500)], [16, 18, 20, 22]);
});

test('guard: real flow — join is held until proven, then matches', async () => {
  const { url, close } = await setup({ store: new MemoryStore(), requireProof: true, guard: new Guard({ baseBits: 8 }) });
  const make = (n: number) => {
    const s: Client = connect(url, { auth: { deviceId: uuid(n) }, transports: ['websocket'], forceNew: true, reconnection: false });
    const challenge = once(s, 'guard:challenge');
    return { s, challenge };
  };
  const A = make(1);
  const B = make(2);
  try {
    const ca = await A.challenge;
    const cb = await B.challenge;
    A.s.emit('queue:join', { gender: 'male', interests: [], mode: 'text' });
    B.s.emit('queue:join', { gender: 'female', interests: [], mode: 'text' });
    assert.equal(await never(B.s, 'match:found'), true, 'no matching before the proof');

    const retry = once(A.s, 'guard:challenge');
    A.s.emit('guard:proof', 'nope');
    const ca2 = await retry;
    assert.notEqual(ca2.challenge, ca.challenge);

    const matched = once(B.s, 'match:found');
    A.s.emit('guard:proof', solve(ca2));
    B.s.emit('guard:proof', solve(cb));
    await matched;
  } finally {
    A.s.disconnect();
    B.s.disconnect();
    await close();
  }
});

test('guard: event floods are dropped, then the socket is cut off', async () => {
  const { url, sock, close } = await setup();
  try {
    const bot = await sock(uuid(3));
    const kicked = once(bot, 'guard:slow-down');
    const gone = new Promise((r) => bot.once('disconnect', r));
    for (let i = 0; i < 200; i++) bot.emit('chat:typing', true);
    assert.deepEqual(await kicked, { reason: 'flood', retryAfterMs: 300_000 });
    await gone;
    // The same browser can't come straight back.
    const again: Client = connect(url, { auth: { deviceId: uuid(3) }, transports: ['websocket'], forceNew: true, reconnection: false });
    const err = await new Promise<Error>((r) => again.once('connect_error', r));
    assert.equal(err.message, 'rate-limited');
    again.disconnect();
  } finally {
    await close();
  }
});

test('guard: connection floods from one IP are refused', async () => {
  const guard = new Guard({ maxConnectsPer10Min: 5 });
  const { url, close } = await setup({ store: new MemoryStore(), guard });
  const attempt = (n: number) =>
    new Promise<'ok' | 'refused'>((r) => {
      const s: Client = connect(url, { auth: { deviceId: uuid(n) }, transports: ['websocket'], forceNew: true, reconnection: false });
      s.once('stats', () => (s.disconnect(), r('ok')));
      s.once('connect_error', () => (s.disconnect(), r('refused')));
    });
  try {
    const results: string[] = [];
    for (let i = 0; i < 7; i++) results.push(await attempt(10 + i));
    assert.deepEqual(results, ['ok', 'ok', 'ok', 'ok', 'ok', 'refused', 'refused']);
  } finally {
    await close();
  }
});

test('guard: strangers cannot swap links or spam the same line', async () => {
  const { sock, close } = await setup();
  try {
    const a = await sock(uuid(20));
    const b = await sock(uuid(21));
    a.emit('queue:join', { gender: 'male', interests: [], mode: 'text' });
    await once(a, 'queue:waiting');
    const m = once(b, 'match:found');
    b.emit('queue:join', { gender: 'female', interests: [], mode: 'text' });
    await m;

    for (const text of ['check https://evil.example', 'add me on snap: cutie22', 'my tg t.me/bot', 'visit freegirls . com', 'dm @hot_girl_99']) {
      const rejected = once(a, 'chat:rejected');
      a.emit('chat:message', text);
      assert.equal(await rejected, 'link', text);
    }
    const ok = once(b, 'chat:message');
    a.emit('chat:message', 'hi! where are you from? i like music.');
    assert.equal((await ok).text, 'hi! where are you from? i like music.');

    a.emit('chat:message', 'hello');
    a.emit('chat:message', 'hello');
    const spam = once(a, 'chat:rejected');
    a.emit('chat:message', 'HELLO');
    assert.equal(await spam, 'spam');
  } finally {
    await close();
  }
});

test('guard: skipping too fast pauses matching', async () => {
  const guard = new Guard();
  for (let i = 0; i < 40; i++) assert.equal(guard.noteMatch('d:x'), 0);
  assert.equal(guard.noteMatch('d:x'), 30_000);
  assert.ok(guard.pausedFor('d:x') > 29_000);
  assert.equal(guard.pausedFor('d:y'), 0);
});

test('guard: a declined call request cannot be looped', async () => {
  const accounts = new MemoryAccountStore();
  const { sock, close } = await setup({ store: new MemoryStore(), accounts });
  try {
    const p = (await accounts.createUser('plus@example.com', 'h')) as { id: string };
    await accounts.setPlus(p.id, { ...NO_PLUS, status: 'admin', until: Date.now() + 86_400_000 });
    const caller = await sock(uuid(30), await accounts.createToken(p.id, 'session'));
    const callee = await sock(uuid(31));
    callee.emit('queue:join', { gender: 'female', interests: [], mode: 'text' });
    await once(callee, 'queue:waiting');
    caller.emit('queue:join', { gender: 'male', interests: [], mode: 'text', browse: true });
    await new Promise((r) => setTimeout(r, 100));
    const ask = <T,>(fn: (cb: (r: T) => void) => void) => new Promise<T>((r) => fn(r));
    const users = await ask<{ publicId: string }[] | null>((cb) => caller.emit('users:list', cb));
    const target = users!.find(Boolean)!;

    const incoming = once(callee, 'call:incoming');
    const first = await ask<{ ok: boolean }>((cb) => caller.emit('users:call', target.publicId, cb as never));
    assert.equal(first.ok, true);
    const { requestId } = await incoming;
    const answered = once(caller, 'call:answered');
    callee.emit('users:answer', requestId, false);
    assert.deepEqual(await answered, { accepted: false, reason: 'declined' });

    const again = await ask<{ ok: boolean; reason?: string }>((cb) => caller.emit('users:call', target.publicId, cb as never));
    assert.deepEqual(again, { ok: false, reason: 'cooldown' });
  } finally {
    await close();
  }
});

test('guard: HTTP floods and admin token guessing get 429', async () => {
  const { url, close } = await setup({ store: new MemoryStore(), adminToken: 'right-token' });
  try {
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await fetch(`${url}/admin/summary`, { headers: { authorization: 'Bearer wrong' } })).status);
    assert.deepEqual(codes, [...Array(10).fill(401), 429]);
    assert.equal((await fetch(`${url}/admin/summary`, { headers: { authorization: 'Bearer right-token' } })).status, 429, 'locked out for a while');
  } finally {
    await close();
  }
});

test('link detector', () => {
  for (const t of ['www.site.org', 'insta: me', 'whatsapp +91 99', 'onlyfans', 'go to abc(dot)com']) assert.ok(looksLikeLink(t), t);
  for (const t of ['i love c.s. lewis', 'hello :)', 'lol.', 'my email is not here', 'i am at home', 'see you @ 5']) assert.ok(!looksLikeLink(t), t);
});
