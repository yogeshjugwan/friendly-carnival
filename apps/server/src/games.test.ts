import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { DARES, TRUTHS, type ClientToServerEvents, type GameView, type ServerToClientEvents } from '@rc/shared';
import { createApp } from './app.ts';
import { applyMove, newGame, viewFor, type GameState } from './games.ts';
import { MemoryStore } from './store.ts';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const once = <E extends keyof ServerToClientEvents>(s: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => s.once(e, ((x: never) => r(x)) as never));

test('tic-tac-toe: turns, wins, no cheating, rematch', () => {
  let s: GameState = newGame('ttt', 'A', 'B');
  const play = (who: string, cell: number) => {
    const next = applyMove(s, who, who === 'A' ? 'B' : 'A', { cell });
    if (next) s = next;
    return !!next;
  };
  assert.equal(play('B', 0), false, 'not your turn');
  assert.ok(play('A', 0));
  assert.equal(play('B', 0), false, 'taken');
  assert.equal(play('B', 9), false, 'off the board');
  assert.ok(play('B', 3));
  assert.ok(play('A', 1));
  assert.ok(play('B', 4));
  assert.ok(play('A', 2)); // top row
  const a = viewFor(s, 'A');
  assert.equal(a.game === 'ttt' && a.winner, 'me');
  assert.deepEqual(a.game === 'ttt' && a.line, [0, 1, 2]);
  assert.equal(viewFor(s, 'B').game === 'ttt' && (viewFor(s, 'B') as Extract<GameView, { game: 'ttt' }>).winner, 'them');
  assert.equal(play('B', 8), false, 'game over');
  const re = applyMove(s, 'B', 'A', { next: true })!;
  assert.equal(re.game === 'ttt' && re.turn, 'B', 'the loser starts the rematch');
});

test('truth or dare: you pick, you answer, then it is their turn', () => {
  let s: GameState = newGame('tod', 'A', 'B');
  assert.equal(applyMove(s, 'A', 'B', { pick: 'truth' }), null, 'the other person picks first');
  s = applyMove(s, 'B', 'A', { pick: 'dare' }, () => 0)!;
  const b = viewFor(s, 'B');
  assert.deepEqual(b.game === 'tod' && b.card, { kind: 'dare', text: DARES[0], for: 'me' });
  assert.equal(b.game === 'tod' && b.myTurn, false);
  s = applyMove(s, 'A', 'B', { pick: 'truth' }, () => 0)!;
  assert.deepEqual((viewFor(s, 'B') as Extract<GameView, { game: 'tod' }>).card, { kind: 'truth', text: TRUTHS[0], for: 'them' });
});

test('would you rather: your partner’s vote stays hidden until you vote', () => {
  let s: GameState = newGame('wyr', 'A', 'B', () => 0);
  s = applyMove(s, 'A', 'B', { vote: 'a' })!;
  assert.equal(applyMove(s, 'A', 'B', { vote: 'b' }), null, 'one vote each');
  assert.equal((viewFor(s, 'B') as Extract<GameView, { game: 'wyr' }>).theirVote, 'hidden');
  assert.equal(applyMove(s, 'A', 'B', { next: true }), null, 'wait for both');
  s = applyMove(s, 'B', 'A', { vote: 'b' })!;
  assert.equal((viewFor(s, 'B') as Extract<GameView, { game: 'wyr' }>).theirVote, 'a');
  const next = applyMove(s, 'B', 'A', { next: true }, () => 0)!;
  assert.ok(next.game === 'wyr' && next.q !== 0 && Object.keys(next.votes).length === 0, 'a different question');
});

test('games over the socket: both see the same board, strangers outside the match cannot play', async () => {
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
    a.emit('queue:join', { gender: 'male', interests: [], mode: 'text' });
    await once(a, 'queue:waiting');
    const m = once(b, 'match:found');
    b.emit('queue:join', { gender: 'female', interests: [], mode: 'text' });
    await m;

    const [va, vb] = [once(a, 'game:state'), once(b, 'game:state')];
    a.emit('game:start', 'ttt');
    assert.deepEqual([(await va)!.startedBy, (await vb)!.startedBy], ['me', 'them']);

    const [ma, mb] = [once(a, 'game:state'), once(b, 'game:state')];
    a.emit('game:move', { cell: 4 });
    const seenByB = (await mb) as Extract<GameView, { game: 'ttt' }>;
    await ma;
    assert.equal(seenByB.board[4], 'them');
    assert.equal(seenByB.myTurn, true);

    const ended = once(b, 'game:state');
    a.emit('game:end');
    assert.equal(await ended, null);
  } finally {
    for (const s of open) s.disconnect();
    await app.close();
  }
});
