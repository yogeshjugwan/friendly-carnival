/**
 * Load test: N simulated users join, "chat" for a random 3–8 s, press Next and
 * repeat. Measures time from joining the queue to being matched.
 *
 *   pnpm --filter @rc/server loadtest -- --users 200 --duration 60
 *   pnpm --filter @rc/server loadtest -- --url https://your-server.onrender.com
 *
 * Phase 4 gate: median time-to-match under 5 s at 200 concurrent users.
 * Only point this at a server you own.
 */
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, Gender, ServerToClientEvents } from '@rc/shared';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:4100' },
    users: { type: 'string', default: '200' },
    duration: { type: 'string', default: '60' },
    ramp: { type: 'string', default: '10' },
  },
});

const URL = values.url!;
const USERS = Number(values.users);
const DURATION_MS = Number(values.duration) * 1000;
const RAMP_MS = Number(values.ramp) * 1000;
const GENDERS: Gender[] = ['male', 'female', 'couple'];
const INTERESTS = ['music', 'travel', 'cricket', 'movies', 'gaming', 'books', 'food', 'tech'];

const waits: number[] = [];
let matches = 0;
let connectFailures = 0;
let errors = 0;
const sockets: Socket[] = [];
let stopping = false;

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function virtualUser(i: number) {
  const s: Socket<ServerToClientEvents, ClientToServerEvents> = io(URL, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    timeout: 20_000,
    auth: { deviceId: randomUUID() },
  });
  sockets.push(s);
  const profile = {
    gender: pick(GENDERS),
    interests: Math.random() < 0.5 ? [pick(INTERESTS), pick(INTERESTS)] : [],
    mode: Math.random() < 0.9 ? ('video' as const) : ('text' as const),
  };
  let queuedAt = 0;
  let chatTimer: NodeJS.Timeout | undefined;

  const join = () => {
    if (stopping) return;
    queuedAt = Date.now();
    s.emit('queue:join', profile);
  };

  s.on('connect', join);
  s.on('connect_error', () => connectFailures++);
  s.on('error:message', () => errors++);
  s.on('match:found', () => {
    waits.push(Date.now() - queuedAt);
    matches++;
    // Talk for 3–8 s, then press Next (the server re-queues us).
    chatTimer = setTimeout(() => {
      if (stopping) return;
      queuedAt = Date.now();
      s.emit('call:next');
    }, 3_000 + Math.random() * 5_000);
  });
  // Our partner pressed Next or left: back into the queue, like the real client.
  s.on('partner:left', () => {
    clearTimeout(chatTimer);
    join();
  });
  void i;
}

const pct = (xs: number[], p: number) => {
  if (!xs.length) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
};
const s1 = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

async function main() {
  console.log(`Load test: ${USERS} users against ${URL} for ${DURATION_MS / 1000} s (ramp ${RAMP_MS / 1000} s)`);
  const start = Date.now();
  for (let i = 0; i < USERS; i++) {
    virtualUser(i);
    await sleep(RAMP_MS / USERS);
  }
  const progress = setInterval(() => {
    const connected = sockets.filter((s) => s.connected).length;
    console.log(`  t=${Math.round((Date.now() - start) / 1000)}s connected=${connected} matches=${matches} p50=${s1(pct(waits, 50))}`);
  }, 10_000);
  await sleep(Math.max(0, DURATION_MS - (Date.now() - start)));
  clearInterval(progress);
  stopping = true;

  const health = await fetch(URL + '/health').then((r) => r.json()).catch(() => null);
  sockets.forEach((s) => s.disconnect());

  // Skip the ramp-up, when the queue is still filling.
  const elapsedMin = (Date.now() - start) / 60_000;
  const under5 = waits.filter((w) => w < 5_000).length / (waits.length || 1);
  const p50 = pct(waits, 50);
  console.log('\nResults');
  console.log(`  matches            ${matches} (${Math.round(matches / elapsedMin)}/min)`);
  console.log(`  time to match p50  ${s1(p50)}`);
  console.log(`  time to match p95  ${s1(pct(waits, 95))}`);
  console.log(`  time to match p99  ${s1(pct(waits, 99))}`);
  console.log(`  time to match max  ${s1(Math.max(...waits))}`);
  console.log(`  matched under 5 s  ${(under5 * 100).toFixed(1)}%`);
  console.log(`  connect failures   ${connectFailures}, server errors ${errors}`);
  if (health) console.log(`  server /health     online=${health.online} waiting=${health.waiting}`);
  const pass = p50 < 5_000 && connectFailures === 0;
  console.log(`\nGate (p50 < 5 s, no connect failures): ${pass ? 'PASS' : 'FAIL'}`);
  process.exit(pass ? 0 : 1);
}

void main();
