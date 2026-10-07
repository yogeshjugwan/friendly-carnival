import { DARES, TRUTHS, WOULD_YOU_RATHER, type GameId, type GameMove, type GameView } from '@rc/shared';

/**
 * Mini-games played inside a match. The server keeps the state so both people
 * always see the same board / card and nobody can play out of turn.
 * Players are referred to by socket id.
 */
export type GameState =
  | { game: 'ttt'; startedBy: string; board: (string | null)[]; turn: string; winner: string | 'draw' | null; line: number[] | null }
  | { game: 'tod'; startedBy: string; turn: string; card: { kind: 'truth' | 'dare'; text: string; for: string } | null }
  | { game: 'wyr'; startedBy: string; q: number; votes: Record<string, 'a' | 'b'> };

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const pick = <T>(list: readonly T[], rand: () => number) => list[Math.floor(rand() * list.length)]!;

export function newGame(game: GameId, startedBy: string, other: string, rand: () => number = Math.random): GameState {
  if (game === 'ttt') return { game, startedBy, board: Array(9).fill(null), turn: startedBy, winner: null, line: null };
  if (game === 'tod') return { game, startedBy, turn: other, card: null };
  return { game, startedBy, q: Math.floor(rand() * WOULD_YOU_RATHER.length), votes: {} };
}

/** Applies a move by `player`; returns the new state, or null if the move isn't allowed. */
export function applyMove(state: GameState, player: string, other: string, move: GameMove, rand: () => number = Math.random): GameState | null {
  if (state.game === 'ttt') {
    if ('next' in move) {
      // Rematch: the loser (or the one who didn't start) goes first.
      if (!state.winner) return null;
      const first = state.winner === 'draw' ? (state.startedBy === player ? other : player) : state.winner === player ? other : player;
      return { ...newGame('ttt', first, first === player ? other : player), startedBy: state.startedBy };
    }
    if (!('cell' in move) || state.winner || state.turn !== player) return null;
    const { cell } = move;
    if (!Number.isInteger(cell) || cell < 0 || cell > 8 || state.board[cell]) return null;
    const board = state.board.slice();
    board[cell] = player;
    const line = LINES.find((l) => l.every((i) => board[i] === player)) ?? null;
    const winner = line ? player : board.every(Boolean) ? 'draw' : null;
    return { ...state, board, turn: other, winner, line };
  }

  if (state.game === 'tod') {
    if (!('pick' in move) || state.turn !== player || (move.pick !== 'truth' && move.pick !== 'dare')) return null;
    const text = pick(move.pick === 'truth' ? TRUTHS : DARES, rand);
    // You answer your own pick; then it's their turn to choose.
    return { ...state, card: { kind: move.pick, text, for: player }, turn: other };
  }

  if ('next' in move) {
    if (!state.votes[player] || !state.votes[other]) return null;
    let q = Math.floor(rand() * WOULD_YOU_RATHER.length);
    if (q === state.q) q = (q + 1) % WOULD_YOU_RATHER.length;
    return { ...state, q, votes: {} };
  }
  if (!('vote' in move) || (move.vote !== 'a' && move.vote !== 'b') || state.votes[player]) return null;
  return { ...state, votes: { ...state.votes, [player]: move.vote } };
}

/** What one player sees. */
export function viewFor(state: GameState, me: string): GameView {
  const who = (id: string | null): 'me' | 'them' | null => (id === null ? null : id === me ? 'me' : 'them');
  const startedBy = who(state.startedBy)!;
  if (state.game === 'ttt') {
    return {
      game: 'ttt',
      startedBy,
      board: state.board.map(who),
      myTurn: !state.winner && state.turn === me,
      winner: state.winner === 'draw' ? 'draw' : who(state.winner),
      line: state.line,
    };
  }
  if (state.game === 'tod') {
    return { game: 'tod', startedBy, myTurn: state.turn === me, card: state.card ? { ...state.card, for: who(state.card.for)! } : null };
  }
  const mine = state.votes[me] ?? null;
  const other = Object.entries(state.votes).find(([id]) => id !== me)?.[1] ?? null;
  return {
    game: 'wyr',
    startedBy,
    question: WOULD_YOU_RATHER[state.q]!,
    myVote: mine,
    theirVote: other === null ? null : mine ? other : 'hidden',
  };
}
