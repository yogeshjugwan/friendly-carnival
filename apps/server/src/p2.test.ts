import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameStore, newGame } from './games.ts';
import { log, logSink, redact, redactText } from './log.ts';
import { parseGameId, parseReaction, parseReportReason, parseReportTarget, parseRoomJoin } from './validate.ts';

test('games: dropped when a player leaves; eviction is least recently played, not oldest', () => {
  const g = new GameStore(2);
  g.set('m1', newGame('ttt', 'a', 'b'), 'a', 'b');
  g.set('m2', newGame('wyr', 'c', 'd'), 'c', 'd');
  // m1 is played again, so m2 is now the least recently used.
  g.set('m1', newGame('ttt', 'b', 'a'), 'a', 'b');
  g.set('m3', newGame('tod', 'e', 'f'), 'e', 'f');
  assert.ok(g.get('m1'), 'active game kept');
  assert.equal(g.get('m2'), undefined, 'idle game evicted');
  assert.ok(g.get('m3'));
  g.endFor('b');
  assert.equal(g.get('m1'), undefined, 'match end drops the game');
  assert.equal(g.size, 1);
  // A player starting a game in a new match drops their old one.
  g.set('m4', newGame('ttt', 'e', 'z'), 'e', 'z');
  assert.equal(g.get('m3'), undefined);
  assert.equal(g.delete('m4'), true);
  assert.equal(g.delete('m4'), false);
});

test('validate: socket payload parsers', () => {
  assert.equal(parseReaction('👍'), '👍');
  assert.equal(parseReaction('<script>'), null);
  assert.equal(parseGameId('ttt'), 'ttt');
  assert.equal(parseGameId({}), null);
  assert.equal(parseReportReason('scam'), 'scam');
  assert.equal(parseReportReason('meh'), null);
  assert.equal(parseReportTarget('previous'), 'previous');
  assert.equal(parseReportTarget('x'), null);
  assert.deepEqual(parseRoomJoin('music', 'voice', 'female'), { topic: 'music', mode: 'voice', gender: 'female' });
  assert.equal(parseRoomJoin('music', 'text', 'female'), null);
  assert.equal(parseRoomJoin('nope', 'video', 'male'), null);
  assert.equal(parseRoomJoin('music', 'video', 'robot'), null);
});

test('log: redacts emails, tokens, links and auth headers', () => {
  const token = 'a'.repeat(40);
  assert.equal(redactText(`mail a.b@example.com at https://x.io/reset?t=1 with Bearer ${token}`), 'mail [email] at [link] with Bearer [token]');
  const e = Object.assign(new Error(`bad token ${token} for jo@x.in`), { code: 'E1', config: { headers: { authorization: 'Bearer zzz' } } });
  const out = redact({ err: e, headers: { authorization: 'Bearer zzz', cookie: 'sid=1' }, email: 'jo@x.in', n: 3 }) as Record<string, any>;
  assert.equal(out.err.message, 'bad token [token] for [email]');
  assert.equal(out.err.code, 'E1');
  assert.equal(out.err.config, undefined, 'error request data is not logged');
  assert.deepEqual(out.headers, { authorization: '[redacted]', cookie: '[redacted]' });
  assert.equal(out.email, '[redacted]');
  assert.equal(out.n, 3);

  const lines: string[] = [];
  const write = logSink.write;
  logSink.write = (_l, line) => void lines.push(line);
  try {
    log.error('handshake', new Error('db down for jo@x.in'), { userEmail: 'jo@x.in' });
  } finally {
    logSink.write = write;
  }
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /^\[handshake\] \{/);
  assert.ok(!lines[0]!.includes('jo@x.in'), lines[0]);
});
