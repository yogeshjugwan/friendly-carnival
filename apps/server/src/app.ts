import { log } from './log.ts';
import { createHash } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import {
  REFERRAL,
  NEW_ACCOUNT_MS,
  NEW_DEVICE_MS,
  MAX_RELAY_CHUNK_BYTES,
  MAX_SNAPSHOT_BYTES,
  type CallAnswer,
  type AgeHold,
  type Wallet,
  type CallResult,
  type HandshakeAuth,
  type PartnerLeftReason,
} from '@rc/shared';
import type { AccountStore } from './accounts.ts';
import { Analytics, dayOf } from './analytics.ts';
import { PushService, type PushSender } from './push.ts';
import { Guard } from './guard.ts';
import { GameStore } from './games.ts';
import { type AppContext, type IO, type SocketData, type SocketScope } from './sockets/context.ts';
import { createStartRequest, registerCall, registerCallCleanup } from './sockets/call.ts';
import { registerBilling } from './sockets/billing.ts';
import { registerRooms } from './sockets/rooms.ts';
import { registerGames } from './sockets/games.ts';
import { registerDm } from './sockets/dm.ts';
import { registerSafety } from './sockets/safety.ts';
import { Rooms } from './rooms.ts';
import { Razorpay } from './razorpay.ts';
import { LOW_TRUST, SkipTracker, trustScore } from './trust.ts';
import { Translator } from './translate.ts';
import { runWinback } from './winback.ts';
import { cors, RateLimiter, readJson, sendJson } from './http.ts';
import { isPlusActive, MemoryAccountStore, NO_PLUS } from './accounts.ts';
import type { BillingProvider } from './billing.ts';
import { createBillingHandler } from './billing-http.ts';
import { handleAdmin } from './admin.ts';
import { ageHoldOf, createAuthHandler } from './auth.ts';
import { createGoogleHandler, type GoogleConfig } from './google.ts';
import { MatchLimits, type LimitOptions } from './limits.ts';
import { TurnCredentials, type TurnConfig } from './turn.ts';
import { ConsoleMailer, type Mailer } from './mailer.ts';
import { config } from './config.ts';
import { Matchmaker, type Pairing } from './matchmaker.ts';
import { banInfo, clientIp, hashIp, isDeviceId, Safety, SNAPSHOT_RETENTION_MS } from './safety.ts';
import { MemoryStore, type SafetyStore } from './store.ts';
import { parseProfile } from './validate.ts';

export { ROOM_SIGNAL_BURST, ROOM_SIGNAL_WINDOW_MS } from './sockets/rooms.ts';

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
  /** Replaces Web Push delivery (tests). */
  pushSender?: PushSender;
  /** Require a proof of work before matching (on in production; off in most tests). */
  requireProof?: boolean;
  /** Chat translation (tests inject one with a fake fetch). */
  translator?: Translator;
  /** Send win-back emails (needs a real mailer). */
  winback?: boolean;
  /** Razorpay client (tests inject one with a fake fetch); null turns it off. */
  razorpay?: Razorpay | null;
  /** How long a ⭐ priority match waits for a verified partner before refunding (tests shorten it). */
  priorityWaitMs?: number;
  /** Delay before "your friend is online" pushes, so the profile name is known (tests shorten it). */
  friendOnlineDelayMs?: number;
  /** Bot / flood shield (tests pass their own to tune it). */
  guard?: Guard;
  /** TURN provider (defaults to the environment); fetch is injectable for tests. */
  turn?: TurnConfig;
  turnFetch?: typeof fetch;
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
    if (!partnerId) return;
    // The match is over: so is any mini-game in it.
    games.endFor(partnerId);
    io.to(partnerId).emit('partner:left', reason);
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

  const push = new PushService(accounts, opts.webUrl ?? config.webUrl, opts.pushSender);

  /** Updates live sessions after an age hold changes; a new hold ends their chat. */
  const setAgeHold = (userId: string, hold: AgeHold) => {
    for (const s of io.sockets.sockets.values()) {
      if (s.data.userId !== userId) continue;
      s.data.ageHold = hold;
      if (!hold) continue;
      matchmaker.leaveQueue(s.id);
      notifyLeft(matchmaker.endMatch(s.id)?.id, 'stop');
      s.emit('age:hold', hold);
    }
  };

  /** Users who had a chat today (IST), for daily rewards. */
  const chatDay = new Map<string, string>();
  const handleAuth = createAuthHandler({
    push,
    chattedToday: (userId) => chatDay.get(userId) === dayOf(Date.now()),
    onCoins: (userId) => void pushWallet(userId),
    onPlusChanged: (userId) => onPlusChanged(userId),
    onAgeChanged: (userId, hold) => setAgeHold(userId, hold),
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
  const walletOf = (u: { coins: number; boostUntil: number | null }): Wallet => ({
    coins: u.coins,
    boostUntil: u.boostUntil && u.boostUntil > Date.now() ? u.boostUntil : null,
  });
  /** Sends the latest coins/Boost to every open tab of the user. */
  const pushWallet = async (userId: string) => {
    const u = await accounts.userById(userId);
    if (!u) return null;
    const w = walletOf(u);
    for (const s of io.sockets.sockets.values()) if (s.data.userId === userId) s.emit('wallet', w);
    return w;
  };

  // A payment, coin purchase, renewal or cancellation landed: refresh live sessions.
  const onPlusChanged = (userId: string) => {
    void accounts
      .userById(userId)
      .then((u) => {
        const active = !!u && isPlusActive(u.plus);
        matchmaker.setPlus(userId, active);
        for (const s of io.sockets.sockets.values()) if (s.data.userId === userId) s.data.plus = active;
        return pushWallet(userId);
      })
      .catch((e) => log.error('plus', e));
  };

  const handleBilling = createBillingHandler({
    billing: opts.billing ?? null,
    accounts,
    webUrl: opts.webUrl ?? config.webUrl,
    origins,
    onPlusChanged,
    razorpay: opts.razorpay !== undefined ? opts.razorpay : config.razorpay ? new Razorpay(config.razorpay) : null,
  });

  // Chat translation for browsers that can't translate on the device: 60 per minute per IP.
  const translator = opts.translator ?? new Translator(config.translate);
  const translateLimit = new RateLimiter(60, 60_000);
  const handleTranslate = async (req: IncomingMessage, res: ServerResponse) => {
    if (!req.url?.startsWith('/translate')) return false;
    if (cors(req, res, origins)) return true;
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' }), true;
    const key = hashIp(clientIp(req.headers, req.socket.remoteAddress), ipSalt) ?? 'unknown';
    if (!translateLimit.allow(key)) return sendJson(res, 429, { error: 'Too many translations — wait a minute' }), true;
    try {
      const { text, to } = await readJson(req);
      if (typeof text !== 'string' || !text.trim() || text.length > 500 || typeof to !== 'string' || !/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(to)) {
        return sendJson(res, 400, { error: 'Invalid request' }), true;
      }
      const result = await translator.translate(text.trim(), to);
      return result ? (sendJson(res, 200, result), true) : (sendJson(res, 502, { error: 'Could not translate' }), true);
    } catch (e) {
      if (!(e instanceof SyntaxError)) log.error('translate', e);
      return sendJson(res, 400, { error: 'Invalid request' }), true;
    }
  };

  // Every HTTP route: 600 requests per 5 minutes per IP (Stripe webhooks and /health exempt).
  const httpLimit = new RateLimiter(600, 5 * 60_000);
  const http = createServer((req, res) => {
    void (async () => {
      const path = (req.url ?? '').split('?')[0];
      if (path !== '/health' && path !== '/billing/webhook' && path !== '/billing/razorpay/webhook') {
        const key = hashIp(clientIp(req.headers, req.socket.remoteAddress), ipSalt) ?? 'unknown';
        if (!httpLimit.allow(key)) {
          res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '60' });
          return void res.end(JSON.stringify({ error: 'Too many requests. Slow down and try again in a minute.' }));
        }
      }
      if (await handleTranslate(req, res)) return;
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
          shadowPool: () => matchmaker.lowTrustCount,
          accounts,
          analytics,
          clientKey: (req) => hashIp(clientIp(req.headers, req.socket.remoteAddress), ipSalt) ?? 'unknown',
          onPlusChanged,
          onVerifiedChanged: (userId, verified) => {
            matchmaker.setVerified(userId, verified);
            // Passing verification clears an underage review.
            if (verified) {
              void accounts
                .setAgeReview(userId, false)
                .then(() => accounts.userById(userId))
                .then((u) => u && setAgeHold(userId, ageHoldOf(u)))
                .catch((e) => log.error('age', e));
            }
            if (verified) {
              void push.send(userId, { title: '✓ You are verified', body: 'Your blue badge is live — people now see you are real.', url: '/', tag: 'verified' });
            }
            for (const s of io.sockets.sockets.values()) if (s.data.userId === userId) s.data.verified = verified;
          },
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
            turnConfigured: turn.hasTurn(),
            turnProvider: turn.enabled ? (turn.lastError ? `error: ${turn.lastError}` : 'ok') : 'static',
            persistentStore: opts.persistent ?? !(store instanceof MemoryStore),
            billingConfigured: !!opts.billing,
          }),
        );
        return;
      }
      res.writeHead(404).end();
    })().catch((e) => {
      log.error('http', e);
      if (!res.headersSent) res.writeHead(500).end();
    });
  });

  io = new Server(http, {
    cors: { origin: origins },
    // Reports carry a small JPEG snapshot; relay chunks are capped separately.
    maxHttpBufferSize: Math.max(MAX_SNAPSHOT_BYTES, MAX_RELAY_CHUNK_BYTES) + 16 * 1024,
  });

  // New-user protection. First sightings live in memory: devices that show up
  // right after a restart were most likely just reconnecting, so they don't count.
  const clock = opts.now ?? Date.now;
  const bootAt = clock();
  const BOOT_GRACE_MS = 2 * 60_000;
  const MAX_DEVICES = 200_000;
  const deviceFirstSeen = new Map<string, number>();
  const seeDevice = (deviceId: string) => {
    if (deviceId.startsWith('anon:') || deviceFirstSeen.has(deviceId)) return;
    if (deviceFirstSeen.size >= MAX_DEVICES) dropOldest(deviceFirstSeen);
    deviceFirstSeen.set(deviceId, clock());
  };
  const isNewUser = (socketId: string) => {
    const d = io.sockets.sockets.get(socketId)?.data;
    if (!d) return false;
    const now = clock();
    if (d.userId) return !!d.accountCreatedAt && now - d.accountCreatedAt < NEW_ACCOUNT_MS;
    if (d.deviceId.startsWith('anon:')) return true;
    const first = deviceFirstSeen.get(d.deviceId) ?? now;
    return first - bootAt > BOOT_GRACE_MS && now - first < NEW_DEVICE_MS;
  };

  const guard = opts.guard ?? new Guard();
  const requireProof = opts.requireProof ?? false;
  const ipKeyOf = (ipHash: string | null, socketId: string) => (ipHash ? `ip:${ipHash}` : `sock:${socketId}`);

  // Flood shield: too many new connections from one IP (or a device cut off for flooding) are refused.
  io.use((socket, next) => {
    const auth = (socket.handshake.auth ?? {}) as HandshakeAuth;
    const ipHash = hashIp(clientIp(socket.handshake.headers, socket.handshake.address), ipSalt);
    const device = isDeviceId(auth.deviceId) ? `d:${auth.deviceId.toLowerCase()}` : `sock:${socket.id}`;
    if (!guard.allowConnection(ipKeyOf(ipHash, socket.id), device)) return next(new Error('rate-limited'));
    next();
  });

  // Identify the browser and check bans before any event is handled.
  io.use((socket, next) => {
    const auth = (socket.handshake.auth ?? {}) as HandshakeAuth;
    socket.data.deviceId = isDeviceId(auth.deviceId) ? auth.deviceId.toLowerCase() : `anon:${socket.id}`;
    seeDevice(socket.data.deviceId);
    socket.data.ipHash = hashIp(clientIp(socket.handshake.headers, socket.handshake.address), ipSalt);
    socket.data.reportsAt = [];
    const sessionUser = typeof auth.token === 'string' && auth.token ? accounts.useToken(auth.token, 'session') : Promise.resolve(null);
    sessionUser
      .then((user) => {
        socket.data.userId = user?.id ?? null;
        socket.data.accountCreatedAt = user?.createdAt ?? null;
        socket.data.verified = !!user?.verifiedAt;
        socket.data.ageHold = user ? ageHoldOf(user) : null;
        socket.data.plus = !!user && isPlusActive(user.plus);
        socket.data.boostUntil = user?.boostUntil ?? null;
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
        log.error('handshake', e);
        socket.data.userId ??= null;
        socket.data.plus ??= false;
        socket.data.ban = null;
        socket.data.blocked = new Set();
        next();
      });
  });

  const analytics = new Analytics(store, opts.now);
  analytics.start();

  const turn = new TurnCredentials(config.iceServers, opts.turn ?? config.turn, opts.turnFetch);
  void turn.start();

  const limitOpts = opts.limits === undefined ? config.limits : opts.limits;
  const limits = limitOpts && limitOpts.daily > 0 ? new MatchLimits(limitOpts, opts.now) : null;
  /** Account, else browser; guests without a browser id fall back to their (hashed) IP. */
  const limitKey = (d: SocketData) =>
    d.userId ? `u:${d.userId}` : d.deviceId.startsWith('anon:') && d.ipHash ? `ip:${d.ipHash}` : `d:${d.deviceId}`;
  /** False (and tells the client) when a free user has no matches left today, or is on a call-time break. */
  const mayMatch = (socket: { id: string; data: SocketData; emit: IO['emit'] }, mode = matchmaker.get(socket.id)?.mode ?? 'video') => {
    if (!limits || limits.canMatch(limitKey(socket.data), socket.data.plus, mode)) return true;
    socket.emit('limit:reached', limits.status(limitKey(socket.data), false));
    analytics.count('limitHits');
    return false;
  };

  // Free call time (video/voice): count each finished call, and end calls that run past it.
  let callTimer: NodeJS.Timeout | null = null;
  if (limits) {
    const chargeCall = (id: string, mode: string, ms: number) => {
      const s = io.sockets.sockets.get(id);
      if (!s || s.data.plus || mode === 'text') return;
      limits.addCallTime(limitKey(s.data), ms);
      s.emit('limit:status', limits.status(limitKey(s.data), false));
    };
    matchmaker.onMatchEnd = (a, b, matchId) => {
      const started = matchStarted.get(matchId);
      matchStarted.delete(matchId);
      if (!started) return;
      const ms = Date.now() - started;
      chargeCall(a.id, a.mode, ms);
      chargeCall(b.id, b.mode, ms);
    };
    callTimer = setInterval(() => {
      for (const [, s] of io.sockets.sockets) {
        if (s.data.plus) continue;
        const session = matchmaker.get(s.id);
        if (!session?.partnerId || !session.matchId || session.mode === 'text') continue;
        const started = matchStarted.get(session.matchId);
        if (!started || Date.now() - started < limits.callMsLeft(limitKey(s.data))) continue;
        // Out of free call time: end the call; the break starts now.
        notifyLeft(matchmaker.endMatch(s.id)?.id, 'stop');
        matchmaker.leaveQueue(s.id);
        s.emit('limit:reached', limits.status(limitKey(s.data), false));
      }
    }, 15_000);
    callTimer.unref?.();
  }

  const rooms = new Rooms();
  const lastSeenWrite = new Map<string, number>();
  // Win-back emails every 6 hours (only with a real mailer).
  const winbackTimer = opts.winback
    ? setInterval(
        () =>
          void runWinback({
            accounts,
            mailer: opts.mailer ?? new ConsoleMailer(),
            webUrl: opts.webUrl ?? config.webUrl,
            serverUrl: opts.serverUrl ?? config.serverUrl,
            online: matchmaker.onlineCount,
          })
            .then((n) => n && log.info('winback', `sent ${n}`))
            .catch((e) => log.error('winback', e)),
        6 * 3_600_000,
      )
    : null;
  winbackTimer?.unref?.();
  // ---- Trust score / shadow pool ----
  const skips = new SkipTracker();
  const matchStarted = new Map<string, number>();
  /** Recomputes someone's trust and moves them in or out of the shadow pool. */
  const refreshTrust = async (socketId: string) => {
    const d = io.sockets.sockets.get(socketId)?.data;
    if (!d) return;
    const reporters7d = await store.distinctReporters(d.deviceId, Date.now() - 7 * 86_400_000).catch(() => 0);
    const score = trustScore({
      verified: !!d.verified,
      loggedIn: !!d.userId,
      accountAgeMs: d.accountCreatedAt ? Date.now() - d.accountCreatedAt : null,
      reporters7d,
      ...skips.stats(limitKey(d)),
    });
    d.trust = score;
    matchmaker.setLowTrust(socketId, score < LOW_TRUST);
  };

  /** ⭐ Priority matches waiting for a verified partner (refund timers). */
  const priorityTimers = new Map<string, NodeJS.Timeout>();

  /** Mini-game per match. */
  const games = new GameStore();

  /** Matches between friends: they may share links. */
  const friendMatches = new Set<string>();

  /** Per match: account ids that tapped ❤️ Add friend. */
  const friendWants = new Map<string, Set<string>>();

  /** Direct call requests from the Plus "Online now" list: requestId → who asked whom. */
  const callRequests = new Map<string, { from: string; to: string; timer: NodeJS.Timeout; friend: boolean }>();
  const requestFrom = (socketId: string) => [...callRequests.entries()].find(([, r]) => r.from === socketId);
  /** Ends a request and tells the caller how it went (and the callee, if it was withdrawn). */
  const closeRequest = (requestId: string, answer: CallAnswer | null, tellCallee = false) => {
    const r = callRequests.get(requestId);
    if (!r) return;
    clearTimeout(r.timer);
    callRequests.delete(requestId);
    if (answer && !answer.accepted && (answer.reason === 'declined' || answer.reason === 'timeout')) {
      const from = io.sockets.sockets.get(r.from)?.data;
      const to = io.sockets.sockets.get(r.to)?.data;
      if (from && to) guard.noteDeclined(limitKey(from), limitKey(to));
    }
    if (answer) io.to(r.from).emit('call:answered', answer);
    if (tellCallee) io.to(r.to).emit('call:incoming-cancelled', requestId);
  };

  /**
   * Invite rewards: the first time an invited (email-confirmed) account is
   * matched with someone other than its inviter, both get a free Plus day —
   * or coins when they already pay for Plus.
   */
  const grantReferral = async (userId: string, ref: string) => {
    const u = await accounts.userById(userId);
    if (!u) return;
    const paid = isPlusActive(u.plus) && u.plus.status !== 'admin';
    if (paid) {
      await accounts.changeCoins(userId, REFERRAL.coins, 'referral', ref);
      io.to(socketsOfUser(userId)).emit('referral:rewarded', { kind: 'coins', coins: REFERRAL.coins });
      void push.send(userId, { title: '🎁 Invite reward', body: `A friend you invited joined — you got ${REFERRAL.coins} coins!`, url: '/coins', tag: 'referral' });
    } else {
      const from = isPlusActive(u.plus) && u.plus.until ? u.plus.until : Date.now();
      await accounts.setPlus(userId, { ...NO_PLUS, status: 'admin', until: from + REFERRAL.plusDays * 86_400_000 });
      io.to(socketsOfUser(userId)).emit('referral:rewarded', { kind: 'plus', days: REFERRAL.plusDays });
      if (!socketsOfUser(userId).length) {
        void push.send(userId, { title: '🎁 You got free Plus', body: 'A friend you invited just had their first chat. Enjoy a free day of Plus!', url: '/', tag: 'referral' });
      }
    }
    onPlusChanged(userId);
  };
  const socketsOfUser = (userId: string) => [...io.sockets.sockets.values()].filter((s) => s.data.userId === userId).map((s) => s.id);
  const REFERRAL_WINDOW_MS = 24 * 60 * 60_000;
  const checkReferral = async (socketId: string, partnerId: string) => {
    const d = io.sockets.sockets.get(socketId)?.data;
    if (!d?.userId || d.referralDone) return;
    const u = await accounts.userById(d.userId);
    if (!u) return;
    if (u.referralRewarded || (!u.referredBy && Date.now() - u.createdAt > REFERRAL_WINDOW_MS)) {
      d.referralDone = true;
      return;
    }
    if (!u.referredBy || !u.emailVerified) return;
    // Matching your own inviter doesn't count.
    if (io.sockets.sockets.get(partnerId)?.data.userId === u.referredBy) return;
    if (!(await accounts.markReferralRewarded(u.id))) return;
    d.referralDone = true;
    analytics.count('referrals');
    await grantReferral(u.id, `referral:new:${u.id}`);
    const { rewarded } = await accounts.referralCounts(u.referredBy);
    if (rewarded <= REFERRAL.maxRewards) await grantReferral(u.referredBy, `referral:by:${u.id}`);
  };

  /**
   * Push "your friend is online" to friends who aren't on the site. At most once
   * per friend pair every 6 hours, and once per 30 minutes per person coming online.
   */
  /** Same opaque id the Friends list gives `friendId` when `viewer` looks at it. */
  const friendHandleFor = (viewer: string, friendId: string) =>
    createHash('sha256').update(`f:${viewer}:${friendId}`).digest('base64url').slice(0, 16);
  const FRIEND_PAIR_MS = 6 * 60 * 60_000;
  const FRIEND_SELF_MS = 30 * 60_000;
  const lastFriendPush = new Map<string, number>();
  const notifyFriendsOnline = async (userId: string) => {
    const now = Date.now();
    if (now - (lastFriendPush.get(userId) ?? 0) < FRIEND_SELF_MS) return;
    lastFriendPush.set(userId, now);
    if (lastFriendPush.size > 50_000) {
      for (const [k, t] of lastFriendPush) if (now - t > FRIEND_PAIR_MS) lastFriendPush.delete(k);
    }
    for (const f of await accounts.listFriends(userId)) {
      if (socketsOfUser(f.friendId).length) continue;
      const pair = `${f.friendId}<${userId}`;
      if (now - (lastFriendPush.get(pair) ?? 0) < FRIEND_PAIR_MS) continue;
      const subs = await accounts.pushSubscriptions(f.friendId);
      if (!subs.length) continue;
      lastFriendPush.set(pair, now);
      const theirs = (await accounts.listFriends(f.friendId)).find((x) => x.friendId === userId);
      const name = theirs?.nickname || 'Your friend';
      await push.send(f.friendId, {
        title: '❤️ A friend is online',
        body: `${name} is on randomCall now — call them before they go!`,
        url: '/?friends=1',
        tag: `friend-online-${friendHandleFor(f.friendId, userId)}`,
      });
    }
    // People who follow them (one-way), unless they were told above.
    const friendIds = new Set((await accounts.listFriends(userId)).map((f) => f.friendId));
    const myName = [...io.sockets.sockets.values()].find((x) => x.data.userId === userId)?.data.profile?.name || 'Someone you follow';
    for (const follower of await accounts.followers(userId)) {
      if (friendIds.has(follower) || socketsOfUser(follower).length) continue;
      const pair = `${follower}<${userId}`;
      if (now - (lastFriendPush.get(pair) ?? 0) < FRIEND_PAIR_MS) continue;
      lastFriendPush.set(pair, now);
      await push.send(follower, {
        title: '⭐ Online now',
        body: `${myName} is on randomCall — say hi!`,
        url: '/history',
        tag: `follow-online-${friendHandleFor(follower, userId)}`,
      });
    }
  };

  const profileOf = (socketId: string) => {
    const p = io.sockets.sockets.get(socketId)?.data.profile;
    return p ? { name: p.name || undefined, avatar: p.avatar, bio: p.bio, age: p.age } : {};
  };

  const announce = (pairing: Pairing) => {
    const { a, b, matchId, sharedInterests, reconnected } = pairing;
    // A new match replaces any game either person was still in.
    games.endFor(a.id);
    games.endFor(b.id);
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
    for (const [x, y] of [[a.id, b.id], [b.id, a.id]]) void checkReferral(x, y).catch((e) => log.error('referral', e));
    // Skipping through people very fast (bots, spammers): pause their matching for a bit.
    if (!reconnected) {
      for (const id of [a.id, b.id]) {
        const d = io.sockets.sockets.get(id)?.data;
        if (d) guard.noteMatch(limitKey(d));
      }
    }
    for (const id of [a.id, b.id]) {
      const userId = io.sockets.sockets.get(id)?.data.userId;
      if (userId) chatDay.set(userId, dayOf(Date.now()));
    }
    if (chatDay.size > 200_000) chatDay.clear();
    for (const id of [a.id, b.id]) {
      const t = priorityTimers.get(id);
      if (t) {
        clearTimeout(t);
        priorityTimers.delete(id);
      }
    }
    matchStarted.set(matchId, Date.now());
    if (matchStarted.size > 20_000) dropOldest(matchStarted);
    {
      const da = io.sockets.sockets.get(a.id)?.data;
      const db = io.sockets.sockets.get(b.id)?.data;
      if (da && db) {
        skips.matched(limitKey(da), limitKey(db));
        skips.matched(limitKey(db), limitKey(da));
      }
    }
    // History for logged-in people: how they saw this partner.
    for (const [me, other] of [
      [a, b],
      [b, a],
    ] as const) {
      const meData = io.sockets.sockets.get(me.id)?.data;
      const otherData = io.sockets.sockets.get(other.id)?.data;
      if (!meData?.userId || !otherData) continue;
      const otherUser = otherData.userId ?? null;
      void accounts
        .addHistory({
          userId: meData.userId,
          partnerKey: otherUser ?? `g:${createHash('sha256').update(otherData.deviceId).digest('base64url').slice(0, 16)}`,
          partnerUserId: otherUser,
          name: otherData.profile?.name ?? '',
          avatar: otherData.profile?.avatar ?? null,
          gender: other.gender,
          country: other.hideCountry ? null : other.country,
          mode: other.mode,
          at: Date.now(),
        })
        .catch((e) => log.error('history', e));
    }
    analytics.count('matches');
    analytics.count(`${b.mode}Matches`);
    const base = { matchId, mode: b.mode, reconnected, iceServers: turn.current() };
    // b just joined (or pressed Back) and initiates, so a is ready to answer.
    const info = (s: Pairing['a']) => ({
      gender: s.gender,
      country: s.hideCountry ? null : s.country,
      locationHidden: s.hideCountry,
      plus: s.plus,
      isNew: isNewUser(s.id),
      verified: s.verified,
      ...profileOf(s.id),
      sharedInterests,
      topic: a.topic && a.topic === b.topic ? a.topic : null,
    });
    io.to(a.id).emit('match:found', { ...base, initiator: false, partner: info(b) });
    io.to(b.id).emit('match:found', { ...base, initiator: true, partner: info(a) });
    // Already friends? Tell both sides so the ❤️ button shows it.
    const ua = io.sockets.sockets.get(a.id)?.data.userId;
    const ub = io.sockets.sockets.get(b.id)?.data.userId;
    if (ua && ub) {
      void accounts
        .isFriend(ua, ub)
        .then((yes) => {
          if (!yes) return;
          friendMatches.add(matchId);
          if (friendMatches.size > 10_000) dropOldest(friendMatches);
          io.to(a.id).emit('friend:state', 'friends');
          io.to(b.id).emit('friend:state', 'friends');
        })
        .catch(() => undefined);
    }
  };

  const socketsByDevice = new Map<string, Set<string>>();
  const ctx: AppContext = {
    io, opts, matchmaker, metrics, relayedMatches, store, accounts, safety, push, analytics, guard, limits, limitKey, mayMatch,
    notifyLeft, announce, pushWallet, refreshTrust, isNewUser, profileOf, setAgeHold, skips, matchStarted, priorityTimers, games,
    friendMatches, friendWants, callRequests, requestFrom, closeRequest, friendHandleFor, rooms, turn, socketsByDevice,
  };
  io.on('connection', (socket) => {
    const { deviceId, ipHash, blocked, userId, plus, verified } = socket.data;
    // deviceId -> sockets index, so lookups by device are O(1) instead of a scan of every socket.
    let mine = socketsByDevice.get(deviceId);
    if (!mine) socketsByDevice.set(deviceId, (mine = new Set()));
    mine.add(socket.id);
    socket.on('disconnect', () => {
      const set = socketsByDevice.get(deviceId);
      set?.delete(socket.id);
      if (set && !set.size) socketsByDevice.delete(deviceId);
    });
    matchmaker.connect(socket.id, countryFromHeaders(socket.handshake.headers), {
      deviceId,
      ipHash,
      userId,
      plus,
      verified,
      blocked,
      boostUntil: socket.data.boostUntil ?? null,
    });
    socket.emit('stats', { online: matchmaker.onlineCount });

    // ---- Shield: proof of work, event rate limits, skipping brake ----
    const ipKey = ipKeyOf(socket.data.ipHash, socket.id);
    socket.data.human = !requireProof;
    /**
     * Requests that arrived before the proof (a join, or an ack-style request
     * the client is waiting on); run once proven, latest per event.
     */
    const pendingUntilProof = new Map<string, unknown[]>();
    if (requireProof) {
      const c = guard.challenge(ipKey);
      socket.data.challenge = c.challenge;
      socket.emit('guard:challenge', c);
    }
    socket.on('profile:set', (profile) => {
      socket.data.profile = parseProfile(profile);
    });
    socket.on('guard:proof', (nonce) => {
      if (socket.data.human) return;
      if (!guard.verify(socket.data.challenge, nonce)) {
        // Wrong answer: a fresh, harder-to-fake challenge.
        const c = guard.challenge(ipKey);
        socket.data.challenge = c.challenge;
        return void socket.emit('guard:challenge', c);
      }
      socket.data.human = true;
      const queued = [...pendingUntilProof];
      pendingUntilProof.clear();
      for (const [event, args] of queued) {
        for (const handler of socket.listeners(event as 'queue:join')) (handler as (...a: unknown[]) => void)(...args);
      }
    });
    /** Events that need a proven browser (everything that reaches other people). */
    const HUMAN_ONLY = new Set([
      'queue:join',
      'call:next',
      'call:back',
      'users:call',
      'friends:call',
      'users:list',
      'chat:message',
      'relay:start',
      'room:join',
      'room:chat',
    ]);
    /** Of those, the ones replayed after the proof instead of dropped. */
    const QUEUED_UNTIL_PROOF = new Set(['queue:join', 'users:call', 'friends:call', 'users:list', 'room:join']);
    const allowEvent = guard.eventLimiter();
    socket.use(([event, ...args], next) => {
      const verdict = allowEvent(event);
      if (verdict === 'kick') {
        log.warn('guard', 'flood, disconnecting', { key: ipKey.slice(0, 12) });
        // Cut off this browser for 5 minutes, and its IP briefly (shared IPs recover fast).
        guard.block(`d:${socket.data.deviceId}`);
        guard.block(ipKey, 60_000);
        socket.emit('guard:slow-down', { reason: 'flood', retryAfterMs: 5 * 60_000 });
        return void socket.disconnect(true);
      }
      if (verdict === 'drop') return;
      if (!socket.data.human && HUMAN_ONLY.has(event)) {
        // Joins and requests with a reply are held until the proof arrives, so the client never hangs.
        if (QUEUED_UNTIL_PROOF.has(event)) pendingUntilProof.set(event, args);
        return;
      }
      next();
    });
    /** True (and tells the client) while this person is paused for skipping too fast. */
    const pausedForSkipping = () => {
      const left = guard.pausedFor(limitKey(socket.data));
      if (!left) return false;
      matchmaker.leaveQueue(socket.id);
      socket.emit('guard:slow-down', { reason: 'skipping', retryAfterMs: left });
      return true;
    };

    analytics.visit(socket.data.userId ? `u:${socket.data.userId}` : socket.data.deviceId);
    void refreshTrust(socket.id).catch((e) => log.error('trust', e));
    // "Last seen" for win-back emails (at most hourly per user).
    if (socket.data.userId && Date.now() - (lastSeenWrite.get(socket.data.userId) ?? 0) > 3_600_000) {
      lastSeenWrite.set(socket.data.userId, Date.now());
      if (lastSeenWrite.size > 100_000) lastSeenWrite.clear();
      void accounts.touchLastSeen(socket.data.userId, Date.now()).catch(() => undefined);
    }
    const onlineUser = socket.data.userId;
    if (onlineUser && [...io.sockets.sockets.values()].filter((x) => x.data.userId === onlineUser).length === 1) {
      // A moment later, so their name (sent right after connecting) is known.
      setTimeout(() => void notifyFriendsOnline(onlineUser).catch((e) => log.error('push', e)), opts.friendOnlineDelayMs ?? 2_000).unref?.();
    }
    analytics.peak('peakOnline', matchmaker.onlineCount);
    if (limits) socket.emit('limit:status', limits.status(limitKey(socket.data), plus));
    if (userId) void pushWallet(userId).catch(() => undefined);
    if (socket.data.ban) socket.emit('banned', socket.data.ban);
    /** Sliding-window burst limit: true (and records the event) when under `limit` per `windowMs`. */
    const underBurst = (times: number[], limit: number, windowMs: number) => {
      const now = Date.now();
      while (times.length && now - times[0]! > windowMs) times.shift();
      if (times.length >= limit) return false;
      times.push(now);
      return true;
    };

    /** True (and tells the client) while a ban is in force; clears expired bans. */
    const stillBanned = () => {
      const ban = socket.data.ban;
      if (ban && ban.expiresAt !== null && ban.expiresAt <= Date.now()) socket.data.ban = null;
      if (socket.data.ban) socket.emit('banned', socket.data.ban);
      if (!socket.data.ban && socket.data.ageHold) {
        socket.emit('age:hold', socket.data.ageHold);
        return true;
      }
      return !!socket.data.ban;
    };

    const base = { socket, deviceId, ipHash, userId, stillBanned, pausedForSkipping, underBurst };
    const scope: SocketScope = { ...base, startRequest: createStartRequest(ctx, base) };
    registerCall(ctx, scope);
    registerBilling(ctx, scope);
    registerRooms(ctx, scope);
    registerGames(ctx, scope);
    registerDm(ctx, scope);
    registerSafety(ctx, scope);
    registerCallCleanup(ctx, scope);
  });

  const statsTimer = setInterval(
    () => io.emit('stats', { online: matchmaker.onlineCount }),
    opts.statsIntervalMs ?? config.statsIntervalMs,
  );
  // With few people online, recent partners must eventually meet again (see Matchmaker.sweep).
  const sweepTimer = setInterval(() => matchmaker.sweep().forEach(announce), 2_000);
  // Expired rate-limit / allowance entries in memory.
  const memorySweep = setInterval(() => {
    guard.sweep();
    limits?.sweep();
  }, 60_000);
  memorySweep.unref();
  const purgeTimer = setInterval(
    () => void store.purgeSnapshots(Date.now() - SNAPSHOT_RETENTION_MS).catch((e) => log.error('purge', e)),
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
      if (callTimer) clearInterval(callTimer);
      turn.stop();
      for (const r of callRequests.values()) clearTimeout(r.timer);
      for (const t of priorityTimers.values()) clearTimeout(t);
      if (winbackTimer) clearInterval(winbackTimer);
      clearInterval(purgeTimer);
      clearInterval(memorySweep);
      await analytics.stop();
      await io.close();
    },
  };
}

/** Drops the oldest entry (insertion order) of a size-capped Map or Set. */
function dropOldest(c: Map<string, unknown> | Set<string>) {
  const first = c.keys().next();
  if (!first.done) c.delete(first.value);
}

/** Country from a CDN/edge header when deployed behind one; null locally. */
function countryFromHeaders(headers: IncomingHttpHeaders): string | null {
  const raw = headers['cf-ipcountry'] ?? headers['x-vercel-ip-country'] ?? headers['x-country-code'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && /^[A-Z]{2}$/i.test(value) && value.toUpperCase() !== 'XX' ? value.toUpperCase() : null;
}
