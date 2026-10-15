import { randomUUID } from 'node:crypto';
import {
  CALL_REQUEST_MS,
  CHAT_BURST,
  CHAT_WINDOW_MS,
  ICEBREAKERS,
  MAX_RELAY_CHUNK_BYTES,
  RELAY_BYTES_PER_SECOND,
  hasFilters,
  type CallRequestResult,
} from '@rc/shared';
import { looksLikeLink } from '../guard.ts';
import type { Session } from '../matchmaker.ts';
import { parseCallResult, parseChatText, parseJoin, parseReaction, parseSignal } from '../validate.ts';
import type { AppContext, SocketScope } from './context.ts';

export function registerCall(ctx: AppContext, scope: SocketScope) {
  const { io, matchmaker, metrics, relayedMatches, profileOf, limitKey, mayMatch, notifyLeft, announce, refreshTrust, skips, matchStarted, friendMatches, callRequests, requestFrom, closeRequest } = ctx;
  const { socket, stillBanned, pausedForSkipping, startRequest } = scope;
  const sentAt: number[] = [];
  const recentTexts: string[] = [];
  socket.on('queue:join', (payload) => {
    if (stillBanned()) return;
    const join = parseJoin(payload);
    if (!join) return void socket.emit('error:message', 'Invalid join request');
    if (matchmaker.get(socket.id)?.partnerId) return;
    if (pausedForSkipping()) return;
    if (!mayMatch(socket, join.mode)) return;
    if (hasFilters(join.filters) && !socket.data.plus) socket.emit('plus:required');
    // Plus members browse the Online list; any logged-in user can wait for friends.
    const browsing = !!join.browse && (socket.data.plus || !!socket.data.userId);
    const pairing = matchmaker.join(socket.id, join.gender, join.interests, join.mode, join.hideCountry, join.filters, browsing, join.topic ?? null);
    if (pairing) announce(pairing);
    else if (!browsing) socket.emit('queue:waiting');
  });

  socket.on('queue:leave', () => {
    matchmaker.leaveQueue(socket.id);
    notifyLeft(matchmaker.endMatch(socket.id)?.id, 'stop');
  });

  socket.on('call:next', () => {
    const current = matchmaker.get(socket.id);
    if (!current || stillBanned()) return;
    // Skipped within seconds: counts against the person skipped (see trust.ts).
    const skipped = matchmaker.partnerOf(socket.id);
    const started = current.matchId ? matchStarted.get(current.matchId) : undefined;
    if (skipped && started && Date.now() - started < 5_000) {
      const d = io.sockets.sockets.get(skipped.id)?.data;
      if (d) {
        skips.quickSkipped(limitKey(d), limitKey(socket.data));
        void refreshTrust(skipped.id).catch(() => undefined);
      }
    }
    notifyLeft(matchmaker.endMatch(socket.id)?.id, 'next');
    if (pausedForSkipping()) return;
    if (!mayMatch(socket)) return void matchmaker.leaveQueue(socket.id);
    const pairing = matchmaker.rejoin(socket.id);
    if (pairing) announce(pairing);
    else socket.emit('queue:waiting');
  });

  socket.on('call:skip', () => {
    if (!matchmaker.get(socket.id)) return;
    notifyLeft(matchmaker.endMatch(socket.id)?.id, 'next');
    matchmaker.leaveQueue(socket.id);
  });

  socket.on('call:back', () => {
    if (stillBanned() || pausedForSkipping() || !mayMatch(socket)) return;
    const current = matchmaker.partnerOf(socket.id);
    const result = matchmaker.reconnect(socket.id);
    if (typeof result === 'string') return void socket.emit('back:unavailable', result);
    // Leaving a live match to go back: the person being left sees a normal "next".
    if (current && current.id !== result.a.id) notifyLeft(current.id, 'next');
    announce(result);
  });

  let lastIcebreaker = 0;
  socket.on('icebreaker', () => {
    const partner = matchmaker.partnerOf(socket.id);
    const now = Date.now();
    if (!partner || now - lastIcebreaker < 4_000) return;
    lastIcebreaker = now;
    const question = ICEBREAKERS[Math.floor(Math.random() * ICEBREAKERS.length)];
    socket.emit('icebreaker', question);
    io.to(partner.id).emit('icebreaker', question);
  });

  const reactionsAt: number[] = [];
  socket.on('reaction', (emoji) => {
    const reaction = parseReaction(emoji);
    if (!reaction) return;
    const partner = matchmaker.partnerOf(socket.id);
    if (!partner) return;
    // At most 8 reactions per 4 s.
    const now = Date.now();
    while (reactionsAt.length && now - reactionsAt[0]! > 4_000) reactionsAt.shift();
    if (reactionsAt.length >= 8) return;
    reactionsAt.push(now);
    io.to(partner.id).emit('reaction', reaction);
  });

  socket.on('users:list', (ack) => {
    if (typeof ack !== 'function') return;
    if (!socket.data.plus) return ack(null);
    ack(
      matchmaker.listActive(socket.id).map((u) => {
        const session = matchmaker.byPublicId(u.publicId);
        return session ? { ...u, ...profileOf(session.id) } : u;
      }),
    );
  });

  socket.on('users:call', (publicId, ack) => {
    if (typeof ack !== 'function') return;
    if (!socket.data.plus) return ack({ ok: false, reason: 'plus-required' });
    const target = typeof publicId === 'string' ? matchmaker.byPublicId(publicId) : undefined;
    if (!target) return ack({ ok: false, reason: 'gone' });
    ack(startRequest(target, false));
  });

  socket.on('users:cancel', () => {
    const pending = requestFrom(socket.id);
    if (pending) closeRequest(pending[0], null, true);
  });

  socket.on('users:answer', (requestId, accept) => {
    const r = typeof requestId === 'string' ? callRequests.get(requestId) : undefined;
    if (!r || r.to !== socket.id) return;
    if (!accept) return closeRequest(requestId, { accepted: false, reason: 'declined' });
    const oldPartner = matchmaker.partnerOf(r.from);
    const result = matchmaker.pairDirect(r.from, r.to, r.friend);
    if (typeof result === 'string') {
      socket.emit('call:incoming-cancelled', requestId);
      return closeRequest(requestId, { accepted: false, reason: result === 'gone' ? 'gone' : 'busy' });
    }
    closeRequest(requestId, { accepted: true });
    if (oldPartner) notifyLeft(oldPartner.id, 'next');
    announce(result);
  });

  socket.on('settings:reconnect', (allow) => {
    if (typeof allow === 'boolean') matchmaker.setAllowReconnect(socket.id, allow);
  });

  socket.on('chat:message', (payload) => {
    const partner = matchmaker.partnerOf(socket.id);
    if (!partner) return;
    const text = parseChatText(payload);
    if (!text) return void socket.emit('chat:rejected', 'invalid');
    const now = Date.now();
    while (sentAt.length && now - sentAt[0]! > CHAT_WINDOW_MS) sentAt.shift();
    if (sentAt.length >= CHAT_BURST) return void socket.emit('chat:rejected', 'rate-limited');
    // Strangers can't swap links or social handles (the classic bot / scam opener); friends can.
    const matchId = matchmaker.get(socket.id)?.matchId;
    if (looksLikeLink(text) && !(matchId && friendMatches.has(matchId))) return void socket.emit('chat:rejected', 'link');
    // The same message over and over.
    const key = text.toLowerCase().replace(/\s+/g, ' ');
    recentTexts.push(key);
    if (recentTexts.length > 5) recentTexts.shift();
    if (recentTexts.filter((t) => t === key).length >= 3) return void socket.emit('chat:rejected', 'spam');
    sentAt.push(now);
    io.to(partner.id).emit('chat:message', { text, at: now });
  });

  socket.on('chat:typing', (typing) => {
    const partner = matchmaker.partnerOf(socket.id);
    if (partner && typeof typing === 'boolean') io.to(partner.id).emit('chat:typing', typing);
  });

  socket.on('call:result', (payload) => {
    const result = parseCallResult(payload);
    if (!result) return;
    metrics.reports += 1;
    metrics.recent.unshift({ at: Date.now(), connected: result.connected, ms: result.ms, diag: result.diag });
    metrics.recent.length = Math.min(metrics.recent.length, 50);
    if (result.connected) {
      metrics.connected += 1;
      metrics.connectMsTotal += result.ms;
    }
  });

  // Video over the server when WebRTC cannot connect (no TURN, strict networks).
  let relayWindowStart = Date.now();
  let relayWindowBytes = 0;

  socket.on('relay:start', () => {
    const session = matchmaker.get(socket.id);
    const partner = matchmaker.partnerOf(socket.id);
    if (!session?.matchId || !partner) return;
    // Both sides may announce; count each match once.
    if (!relayedMatches.has(session.matchId)) {
      relayedMatches.add(session.matchId);
      metrics.relayCalls += 1;
      if (relayedMatches.size > 10_000) relayedMatches.clear();
    }
    io.to(partner.id).emit('relay:start');
  });

  socket.on('relay:chunk', (chunk) => {
    const partner = matchmaker.partnerOf(socket.id);
    if (!partner || !chunk || typeof chunk !== 'object') return;
    const data = (chunk as { data?: unknown }).data;
    const size = data instanceof ArrayBuffer ? data.byteLength : Buffer.isBuffer(data) ? data.length : -1;
    const { seq, mime } = chunk as { seq?: unknown; mime?: unknown };
    if (size <= 0 || size > MAX_RELAY_CHUNK_BYTES || typeof seq !== 'number' || typeof mime !== 'string' || mime.length > 80) return;
    const now = Date.now();
    if (now - relayWindowStart >= 1_000) {
      relayWindowStart = now;
      relayWindowBytes = 0;
    }
    relayWindowBytes += size;
    if (relayWindowBytes > RELAY_BYTES_PER_SECOND) return; // over budget: drop (the stream recovers on the next keyframe)
    metrics.relayBytes += size;
    io.to(partner.id).emit('relay:chunk', { seq, mime, data: data as ArrayBuffer });
  });

  socket.on('signal', (payload) => {
    const msg = parseSignal(payload);
    const partner = matchmaker.partnerOf(socket.id);
    if (msg && partner) io.to(partner.id).emit('signal', msg);
  });
}

/** Builds the per-socket direct-call sender (Online list and Friends list). */
export function createStartRequest(ctx: AppContext, scope: Omit<SocketScope, 'startRequest'>): SocketScope['startRequest'] {
  const { io, matchmaker, guard, limitKey, isNewUser, profileOf, callRequests, requestFrom, closeRequest } = ctx;
  const { socket, stillBanned } = scope;
  /** Sends a direct call request to `target` (from the Online list or the Friends list). */
  const startRequest = (target: Session, friend: boolean, friendNickname?: string): CallRequestResult => {
    if (stillBanned()) return { ok: false, reason: 'unavailable' };
    if (requestFrom(socket.id)) return { ok: false, reason: 'pending' };
    // Someone with a request already open can't be asked again until it's answered.
    if ([...callRequests.values()].some((r) => r.to === target.id)) return { ok: false, reason: 'busy' };
    const check = matchmaker.canCall(socket.id, target.id, friend);
    if (check !== 'ok') return { ok: false, reason: check };
    // No ringing the same person again and again after they said no.
    const targetData = io.sockets.sockets.get(target.id)?.data;
    if (targetData) {
      const loop = guard.canRequest(limitKey(socket.data), limitKey(targetData));
      if (loop !== 'ok') return { ok: false, reason: loop };
      guard.noteRequest(limitKey(targetData));
    }

    const me = matchmaker.get(socket.id);
    if (!me) return { ok: false, reason: 'unavailable' };
    const requestId = randomUUID();
    const expiresAt = Date.now() + CALL_REQUEST_MS;
    const timer = setTimeout(() => closeRequest(requestId, { accepted: false, reason: 'timeout' }, true), CALL_REQUEST_MS);
    callRequests.set(requestId, { from: socket.id, to: target.id, timer, friend });
    io.to(target.id).emit('call:incoming', {
      requestId,
      expiresAt,
      ...(friend ? { friend: friendNickname ?? '' } : {}),
      from: {
        gender: me.gender,
        country: me.hideCountry ? null : me.country,
        locationHidden: me.hideCountry,
        plus: me.plus,
        isNew: isNewUser(socket.id),
        verified: me.verified,
        ...profileOf(socket.id),
        sharedInterests: me.interests.filter((i) => target.interests.includes(i)),
      },
    });
    return { ok: true, requestId, expiresAt };
  };
  return startRequest;
}

/** Last cleanup when a socket goes: open call requests, its game, its match. */
export function registerCallCleanup(ctx: AppContext, scope: SocketScope) {
  const { matchmaker, notifyLeft, callRequests, closeRequest, games } = ctx;
  const { socket } = scope;
  socket.on('disconnect', () => {
    for (const [id, r] of callRequests) {
      if (r.from === socket.id) closeRequest(id, null, true);
      else if (r.to === socket.id) closeRequest(id, { accepted: false, reason: 'gone' });
    }
    games.endFor(socket.id);
    notifyLeft(matchmaker.disconnect(socket.id)?.id, 'disconnect');
  });
}
