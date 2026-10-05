import { randomUUID } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import {
  CALL_REQUEST_MS,
  CHAT_BURST,
  CHAT_WINDOW_MS,
  MAX_APPEAL_LENGTH,
  MAX_RELAY_CHUNK_BYTES,
  MAX_SNAPSHOT_BYTES,
  RELAY_BYTES_PER_SECOND,
  hasFilters,
  type BanInfo,
  type CallAnswer,
  type CallResult,
  type ClientToServerEvents,
  type HandshakeAuth,
  type PartnerLeftReason,
  type ServerToClientEvents,
} from '@rc/shared';
import type { AccountStore } from './accounts.ts';
import { isPlusActive, MemoryAccountStore } from './accounts.ts';
import type { BillingProvider } from './billing.ts';
import { createBillingHandler } from './billing-http.ts';
import { handleAdmin } from './admin.ts';
import { createAuthHandler } from './auth.ts';
import { createGoogleHandler, type GoogleConfig } from './google.ts';
import { MatchLimits, type LimitOptions } from './limits.ts';
import { ConsoleMailer, type Mailer } from './mailer.ts';
import { config } from './config.ts';
import { Matchmaker, type Pairing } from './matchmaker.ts';
import { banInfo, clientIp, hashIp, isDeviceId, parseReport, Safety, SNAPSHOT_RETENTION_MS } from './safety.ts';
import { MemoryStore, type SafetyStore } from './store.ts';
import { parseCallResult, parseChatText, parseJoin, parseSignal } from './validate.ts';

interface SocketData {
  deviceId: string;
  /** Logged-in account, from the handshake token. */
  userId: string | null;
  /** Active Plus subscription at handshake time (updated live by webhooks). */
  plus: boolean;
  ipHash: string | null;
  /** Set while the device or IP is banned; the socket stays connected so it can appeal. */
  ban: BanInfo | null;
  /** Devices blocked by or blocking this device, loaded at handshake. */
  blocked: Set<string>;
  reportsAt: number[];
}

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Per-socket report limit: 10 reports per 10 minutes. */
const REPORT_BURST = 10;
const REPORT_WINDOW_MS = 10 * 60_000;

export interface CallMetrics {
  reports: number;
  connected: number;
  /** Sum of time-to-connect for connected reports, ms. */
  connectMsTotal: number;
  /** Last results with diagnostics, newest first (for /health). */
  recent: { at: number; connected: boolean; ms: number; diag?: CallResult['diag'] }[];
  /** Video bytes relayed through this server (Socket.IO fallback). */
  relayBytes: number;
  /** Calls that fell back to the relay. */
  relayCalls: number;
}

export interface AppOptions {
  webOrigins?: (string | RegExp)[];
  statsIntervalMs?: number;
  store?: SafetyStore;
  accounts?: AccountStore;
  mailer?: Mailer;
  /** Whether the stores survive restarts (shown on /health). */
  persistent?: boolean;
  adminToken?: string;
  ipSalt?: string;
  webUrl?: string;
  /** Stripe (or a fake in tests); Plus checkout is disabled without it. */
  billing?: BillingProvider | null;
  /** Google sign-in; defaults to GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. */
  google?: GoogleConfig | null;
  serverUrl?: string;
  /** Replaces fetch for the Google token/userinfo calls (tests). */
  googleFetch?: typeof fetch;
  /** Free-user daily match limit; null turns it off. */
  limits?: LimitOptions | null;
  /** Clock for the match limit (tests). */
  now?: () => number;
}

export interface App {
  http: HttpServer;
  io: IO;
  matchmaker: Matchmaker;
  metrics: CallMetrics;
  store: SafetyStore;
  accounts: AccountStore;
  safety: Safety;
  close: () => Promise<void>;
}

export function createApp(opts: AppOptions = {}): App {
  const matchmaker = new Matchmaker(config.recentPartnerMemory);
  const metrics: CallMetrics = { reports: 0, connected: 0, connectMsTotal: 0, recent: [], relayBytes: 0, relayCalls: 0 };
  const relayedMatches = new Set<string>();
  const store = opts.store ?? new MemoryStore();
  const accounts = opts.accounts ?? new MemoryAccountStore();
  const origins = opts.webOrigins ?? config.webOrigins;
  const ipSalt = opts.ipSalt ?? config.ipSalt;
  let io: IO;

  const notifyLeft = (partnerId: string | undefined, reason: PartnerLeftReason) => {
    if (partnerId) io.to(partnerId).emit('partner:left', reason);
  };

  // A new ban takes effect at once: end the banned user's call and show them the ban.
  const safety = new Safety(store, (ban) => {
    for (const socketId of matchmaker.socketsFor(ban.deviceId, ban.ipHash, ban.userId)) {
      const socket = io.sockets.sockets.get(socketId);
      matchmaker.leaveQueue(socketId);
      notifyLeft(matchmaker.endMatch(socketId)?.id, 'disconnect');
      if (socket) {
        socket.data.ban = banInfo(ban, false);
        socket.emit('banned', socket.data.ban);
      }
    }
  });

  const handleAuth = createAuthHandler({
    accounts,
    mailer: opts.mailer ?? new ConsoleMailer(),
    webUrl: opts.webUrl ?? config.webUrl,
    origins,
    clientKey: (req) => hashIp(clientIp(req.headers, req.socket.remoteAddress), ipSalt) ?? 'unknown',
  });

  const handleGoogle = createGoogleHandler({
    google: opts.google === undefined ? config.google : opts.google,
    accounts,
    webUrl: opts.webUrl ?? config.webUrl,
    serverUrl: opts.serverUrl ?? config.serverUrl,
    origins,
    fetch: opts.googleFetch,
  });

  // A payment, renewal or cancellation landed: refresh Plus on the user's live sessions.
  const onPlusChanged = (userId: string) => {
    void accounts
      .userById(userId)
      .then((u) => {
        const active = !!u && isPlusActive(u.plus);
        matchmaker.setPlus(userId, active);
        for (const s of io.sockets.sockets.values()) if (s.data.userId === userId) s.data.plus = active;
      })
      .catch((e) => console.error('[plus]', e));
  };

  const handleBilling = createBillingHandler({
    billing: opts.billing ?? null,
    accounts,
    webUrl: opts.webUrl ?? config.webUrl,
    origins,
    onPlusChanged,
  });

  const http = createServer((req, res) => {
    void (async () => {
      if (await handleBilling(req, res)) return;
      if (await handleGoogle(req, res)) return;
      if (await handleAuth(req, res)) return;
      if (
        await handleAdmin(req, res, {
          store,
          safety,
          token: opts.adminToken ?? config.adminToken,
          origins,
          online: () => matchmaker.onlineCount,
          accounts,
          onPlusChanged,
        })
      )
        return;
      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            online: matchmaker.onlineCount,
            waiting: matchmaker.waitingCount,
            calls: {
              reports: metrics.reports,
              connectRate: metrics.reports ? +(metrics.connected / metrics.reports).toFixed(3) : null,
              avgConnectMs: metrics.connected ? Math.round(metrics.connectMsTotal / metrics.connected) : null,
              relayCalls: metrics.relayCalls,
              relayMB: +(metrics.relayBytes / 1e6).toFixed(1),
              recent: metrics.recent.slice(0, 20).map((r) => ({ ...r, ago: Math.round((Date.now() - r.at) / 1000) + 's' })),
            },
            turnConfigured: config.iceServers.some((s) => s.username),
            persistentStore: opts.persistent ?? !(store instanceof MemoryStore),
            billingConfigured: !!opts.billing,
          }),
        );
        return;
      }
      res.writeHead(404).end();
    })().catch((e) => {
      console.error('[http]', e);
      if (!res.headersSent) res.writeHead(500).end();
    });
  });

  io = new Server(http, {
    cors: { origin: origins },
    // Reports carry a small JPEG snapshot; relay chunks are capped separately.
    maxHttpBufferSize: Math.max(MAX_SNAPSHOT_BYTES, MAX_RELAY_CHUNK_BYTES) + 16 * 1024,
  });

  // Identify the browser and check bans before any event is handled.
  io.use((socket, next) => {
    const auth = (socket.handshake.auth ?? {}) as HandshakeAuth;
    socket.data.deviceId = isDeviceId(auth.deviceId) ? auth.deviceId.toLowerCase() : `anon:${socket.id}`;
    socket.data.ipHash = hashIp(clientIp(socket.handshake.headers, socket.handshake.address), ipSalt);
    socket.data.reportsAt = [];
    const sessionUser = typeof auth.token === 'string' && auth.token ? accounts.useToken(auth.token, 'session') : Promise.resolve(null);
    sessionUser
      .then((user) => {
        socket.data.userId = user?.id ?? null;
        socket.data.plus = !!user && isPlusActive(user.plus);
        return Promise.all([
          safety.checkBan({ deviceId: socket.data.deviceId, ipHash: socket.data.ipHash, userId: socket.data.userId }),
          store.blocksFor(socket.data.deviceId),
        ]);
      })
      .then(([ban, blocked]) => {
        socket.data.ban = ban;
        socket.data.blocked = blocked;
        next();
      })
      .catch((e) => {
        // Fail open: a storage hiccup should not lock everyone out.
        console.error('[handshake]', e);
        socket.data.userId ??= null;
        socket.data.plus ??= false;
        socket.data.ban = null;
        socket.data.blocked = new Set();
        next();
      });
  });

  const limitOpts = opts.limits === undefined ? config.limits : opts.limits;
  const limits = limitOpts && limitOpts.daily > 0 ? new MatchLimits(limitOpts, opts.now) : null;
  /** Account, else browser; guests without a browser id fall back to their (hashed) IP. */
  const limitKey = (d: SocketData) =>
    d.userId ? `u:${d.userId}` : d.deviceId.startsWith('anon:') && d.ipHash ? `ip:${d.ipHash}` : `d:${d.deviceId}`;
  /** False (and tells the client) when a free user has no matches left today. */
  const mayMatch = (socket: { data: SocketData; emit: IO['emit'] }) => {
    if (!limits || limits.canMatch(limitKey(socket.data), socket.data.plus)) return true;
    socket.emit('limit:reached', limits.status(limitKey(socket.data), false));
    return false;
  };

  /** Direct call requests from the Plus "Online now" list: requestId → who asked whom. */
  const callRequests = new Map<string, { from: string; to: string; timer: NodeJS.Timeout }>();
  const requestFrom = (socketId: string) => [...callRequests.entries()].find(([, r]) => r.from === socketId);
  /** Ends a request and tells the caller how it went (and the callee, if it was withdrawn). */
  const closeRequest = (requestId: string, answer: CallAnswer | null, tellCallee = false) => {
    const r = callRequests.get(requestId);
    if (!r) return;
    clearTimeout(r.timer);
    callRequests.delete(requestId);
    if (answer) io.to(r.from).emit('call:answered', answer);
    if (tellCallee) io.to(r.to).emit('call:incoming-cancelled', requestId);
  };

  const announce = (pairing: Pairing) => {
    const { a, b, matchId, sharedInterests, reconnected } = pairing;
    // Matched some other way: any open call request involving them lapses.
    for (const [id, r] of callRequests) {
      if (r.to === a.id || r.to === b.id) closeRequest(id, { accepted: false, reason: 'busy' }, true);
      else if (r.from === a.id || r.from === b.id) closeRequest(id, null, true);
    }
    if (limits) {
      for (const id of [a.id, b.id]) {
        const s = io.sockets.sockets.get(id);
        if (!s || s.data.plus) continue;
        limits.count(limitKey(s.data));
        s.emit('limit:status', limits.status(limitKey(s.data), false));
      }
    }
    const base = { matchId, mode: b.mode, reconnected, iceServers: config.iceServers };
    // b just joined (or pressed Back) and initiates, so a is ready to answer.
    const info = (s: Pairing['a']) => ({
      gender: s.gender,
      country: s.hideCountry ? null : s.country,
      locationHidden: s.hideCountry,
      plus: s.plus,
      sharedInterests,
    });
    io.to(a.id).emit('match:found', { ...base, initiator: false, partner: info(b) });
    io.to(b.id).emit('match:found', { ...base, initiator: true, partner: info(a) });
  };

  io.on('connection', (socket) => {
    const { deviceId, ipHash, blocked, userId, plus } = socket.data;
    matchmaker.connect(socket.id, countryFromHeaders(socket.handshake.headers), { deviceId, ipHash, userId, plus, blocked });
    socket.emit('stats', { online: matchmaker.onlineCount });
    if (limits) socket.emit('limit:status', limits.status(limitKey(socket.data), plus));
    if (socket.data.ban) socket.emit('banned', socket.data.ban);
    const sentAt: number[] = [];

    /** True (and tells the client) while a ban is in force; clears expired bans. */
    const stillBanned = () => {
      const ban = socket.data.ban;
      if (ban && ban.expiresAt !== null && ban.expiresAt <= Date.now()) socket.data.ban = null;
      if (socket.data.ban) socket.emit('banned', socket.data.ban);
      return !!socket.data.ban;
    };

    socket.on('queue:join', (payload) => {
      if (stillBanned()) return;
      const join = parseJoin(payload);
      if (!join) return void socket.emit('error:message', 'Invalid join request');
      if (matchmaker.get(socket.id)?.partnerId) return;
      if (!mayMatch(socket)) return;
      if (hasFilters(join.filters) && !socket.data.plus) socket.emit('plus:required');
      const browsing = !!join.browse && socket.data.plus;
      const pairing = matchmaker.join(socket.id, join.gender, join.interests, join.mode, join.hideCountry, join.filters, browsing);
      if (pairing) announce(pairing);
      else if (!browsing) socket.emit('queue:waiting');
    });

    socket.on('queue:leave', () => {
      matchmaker.leaveQueue(socket.id);
      notifyLeft(matchmaker.endMatch(socket.id)?.id, 'stop');
    });

    socket.on('call:next', () => {
      if (!matchmaker.get(socket.id) || stillBanned()) return;
      notifyLeft(matchmaker.endMatch(socket.id)?.id, 'next');
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
      if (stillBanned() || !mayMatch(socket)) return;
      const current = matchmaker.partnerOf(socket.id);
      const result = matchmaker.reconnect(socket.id);
      if (typeof result === 'string') return void socket.emit('back:unavailable', result);
      // Leaving a live match to go back: the person being left sees a normal "next".
      if (current && current.id !== result.a.id) notifyLeft(current.id, 'next');
      announce(result);
    });

    socket.on('users:list', (ack) => {
      if (typeof ack !== 'function') return;
      if (!socket.data.plus) return ack(null);
      ack(matchmaker.listActive(socket.id));
    });

    socket.on('users:call', (publicId, ack) => {
      if (typeof ack !== 'function') return;
      if (!socket.data.plus) return ack({ ok: false, reason: 'plus-required' });
      if (stillBanned()) return ack({ ok: false, reason: 'unavailable' });
      if (requestFrom(socket.id)) return ack({ ok: false, reason: 'pending' });
      const target = typeof publicId === 'string' ? matchmaker.byPublicId(publicId) : undefined;
      if (!target) return ack({ ok: false, reason: 'gone' });
      // Someone with a request already open can't be asked again until it's answered.
      if ([...callRequests.values()].some((r) => r.to === target.id)) return ack({ ok: false, reason: 'busy' });
      const check = matchmaker.canCall(socket.id, target.id);
      if (check !== 'ok') return ack({ ok: false, reason: check });

      const me = matchmaker.get(socket.id)!;
      const requestId = randomUUID();
      const expiresAt = Date.now() + CALL_REQUEST_MS;
      const timer = setTimeout(() => closeRequest(requestId, { accepted: false, reason: 'timeout' }, true), CALL_REQUEST_MS);
      callRequests.set(requestId, { from: socket.id, to: target.id, timer });
      io.to(target.id).emit('call:incoming', {
        requestId,
        expiresAt,
        from: {
          gender: me.gender,
          country: me.hideCountry ? null : me.country,
          locationHidden: me.hideCountry,
          plus: me.plus,
          sharedInterests: me.interests.filter((i) => target.interests.includes(i)),
        },
      });
      ack({ ok: true, requestId, expiresAt });
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
      const result = matchmaker.pairDirect(r.from, r.to);
      if (typeof result === 'string') {
        socket.emit('call:incoming-cancelled', requestId);
        return closeRequest(requestId, { accepted: false, reason: result === 'gone' ? 'gone' : 'busy' });
      }
      closeRequest(requestId, { accepted: true });
      if (oldPartner) notifyLeft(oldPartner.id, 'next');
      announce(result);
    });

    socket.on('limit:ad-start', () => {
      if (!limits) return;
      const result = limits.startAd(limitKey(socket.data));
      if (result !== 'ok') socket.emit('limit:ad-rejected', result);
    });

    socket.on('limit:ad-done', () => {
      if (!limits) return;
      const key = limitKey(socket.data);
      const result = limits.finishAd(key);
      if (result === 'ok') socket.emit('limit:granted', limits.status(key, socket.data.plus));
      else socket.emit('limit:ad-rejected', result);
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
      sentAt.push(now);
      io.to(partner.id).emit('chat:message', { text, at: now });
    });

    socket.on('chat:typing', (typing) => {
      const partner = matchmaker.partnerOf(socket.id);
      if (partner && typeof typing === 'boolean') io.to(partner.id).emit('chat:typing', typing);
    });

    const targetSocketId = (target: 'current' | 'previous') =>
      target === 'current' ? matchmaker.get(socket.id)?.partnerId ?? undefined : matchmaker.previousPartnerId(socket.id);

    socket.on('report:submit', async (payload) => {
      const report = parseReport(payload);
      if (!report) return void socket.emit('report:rejected', 'invalid');
      const now = Date.now();
      const times = socket.data.reportsAt;
      while (times.length && now - times[0]! > REPORT_WINDOW_MS) times.shift();
      if (times.length >= REPORT_BURST) return void socket.emit('report:rejected', 'rate-limited');

      const targetId = targetSocketId(report.target);
      const target = targetId ? matchmaker.identityOf(targetId) : undefined;
      if (!target) return void socket.emit('report:rejected', 'no-target');
      times.push(now);

      try {
        await safety.report({ deviceId, ipHash, userId }, target, report);
        // People you report are never matched with you again.
        if (report.source === 'user') {
          await store.addBlock(deviceId, target.deviceId);
          matchmaker.block(deviceId, target.deviceId);
        }
        socket.emit('report:received');
      } catch (e) {
        console.error('[report]', e);
        socket.emit('report:rejected', 'invalid');
      }
    });

    socket.on('user:block', async (which) => {
      if (which !== 'current' && which !== 'previous') return;
      const targetId = targetSocketId(which);
      const target = targetId ? matchmaker.identityOf(targetId) : undefined;
      if (!target) return;
      await store.addBlock(deviceId, target.deviceId).catch((e) => console.error('[block]', e));
      matchmaker.block(deviceId, target.deviceId);
      socket.emit('user:blocked');
      if (which === 'current' && matchmaker.get(socket.id)?.partnerId === targetId) {
        notifyLeft(matchmaker.endMatch(socket.id)?.id, 'next');
        const pairing = matchmaker.rejoin(socket.id);
        if (pairing) announce(pairing);
        else socket.emit('queue:waiting');
      }
    });

    socket.on('ban:appeal', async (message) => {
      const ban = socket.data.ban;
      if (!ban || ban.appealPending || typeof message !== 'string') return;
      const text = message.trim().slice(0, MAX_APPEAL_LENGTH);
      if (!text) return;
      if (await store.hasOpenAppeal(ban.banId)) return;
      await store.addAppeal(ban.banId, deviceId, text);
      socket.data.ban = { ...ban, appealPending: true };
      socket.emit('ban:appealed');
      socket.emit('banned', socket.data.ban);
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

    socket.on('disconnect', () => {
      for (const [id, r] of callRequests) {
        if (r.from === socket.id) closeRequest(id, null, true);
        else if (r.to === socket.id) closeRequest(id, { accepted: false, reason: 'gone' });
      }
      notifyLeft(matchmaker.disconnect(socket.id)?.id, 'disconnect');
    });
  });

  const statsTimer = setInterval(
    () => io.emit('stats', { online: matchmaker.onlineCount }),
    opts.statsIntervalMs ?? config.statsIntervalMs,
  );
  // With few people online, recent partners must eventually meet again (see Matchmaker.sweep).
  const sweepTimer = setInterval(() => matchmaker.sweep().forEach(announce), 2_000);
  const purgeTimer = setInterval(
    () => void store.purgeSnapshots(Date.now() - SNAPSHOT_RETENTION_MS).catch((e) => console.error('[purge]', e)),
    60 * 60_000,
  );

  return {
    http,
    io,
    matchmaker,
    metrics,
    store,
    accounts,
    safety,
    close: async () => {
      clearInterval(statsTimer);
      clearInterval(sweepTimer);
      for (const r of callRequests.values()) clearTimeout(r.timer);
      clearInterval(purgeTimer);
      await io.close();
    },
  };
}

/** Country from a CDN/edge header when deployed behind one; null locally. */
function countryFromHeaders(headers: IncomingHttpHeaders): string | null {
  const raw = headers['cf-ipcountry'] ?? headers['x-vercel-ip-country'] ?? headers['x-country-code'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && /^[A-Z]{2}$/i.test(value) && value.toUpperCase() !== 'XX' ? value.toUpperCase() : null;
}
