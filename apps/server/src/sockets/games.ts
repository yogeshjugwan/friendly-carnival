import { applyMove, newGame, viewFor } from '../games.ts';
import { parseGameId } from '../validate.ts';
import type { AppContext, SocketScope } from './context.ts';

export function registerGames(ctx: AppContext, scope: SocketScope) {
  const { io, matchmaker, analytics, games } = ctx;
  const { socket } = scope;
  // ---- Mini-games (the server keeps the board so both see the same thing) ----
  const sendGame = (matchId: string, a: string, b: string) => {
    const entry = games.get(matchId);
    io.to(a).emit('game:state', entry ? viewFor(entry, a) : null);
    io.to(b).emit('game:state', entry ? viewFor(entry, b) : null);
  };
  socket.on('game:start', (game) => {
    const partner = matchmaker.partnerOf(socket.id);
    const matchId = matchmaker.get(socket.id)?.matchId;
    const id = parseGameId(game);
    if (!partner || !matchId || !id) return;
    games.set(matchId, newGame(id, socket.id, partner.id), socket.id, partner.id);
    analytics.count('games');
    sendGame(matchId, socket.id, partner.id);
  });
  socket.on('game:move', (move) => {
    const partner = matchmaker.partnerOf(socket.id);
    const matchId = matchmaker.get(socket.id)?.matchId;
    const state = matchId ? games.get(matchId) : undefined;
    if (!partner || !matchId || !state || !move || typeof move !== 'object') return;
    const next = applyMove(state, socket.id, partner.id, move);
    if (!next) return;
    games.set(matchId, next, socket.id, partner.id);
    sendGame(matchId, socket.id, partner.id);
  });
  socket.on('game:end', () => {
    const partner = matchmaker.partnerOf(socket.id);
    const matchId = matchmaker.get(socket.id)?.matchId;
    if (!partner || !matchId || !games.delete(matchId)) return;
    sendGame(matchId, socket.id, partner.id);
  });
}
