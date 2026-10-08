import { createHash, randomUUID } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import {
  BOOST,
  GAMES,
  REPORT_REASONS,
  TOPICS,
  PRIORITY_MATCH,
  REFERRAL,
  CALL_REQUEST_MS,
  NEW_ACCOUNT_MS,
  NEW_DEVICE_MS,
  availableGifts,
  GIFT_SHARE,
  MATCHES_FOR_COINS,
  ICEBREAKERS,
  MAX_FRIEND_NICKNAME,
  REACTIONS,
  CHAT_BURST,
  CHAT_WINDOW_MS,
  MAX_APPEAL_LENGTH,
  MAX_RELAY_CHUNK_BYTES,
  MAX_SNAPSHOT_BYTES,
  RELAY_BYTES_PER_SECOND,
  hasFilters,
  type BanInfo,
  type BlockedUser,
  type CallAnswer,
  type CallRequestResult,
  type SpendResult,
  type AgeHold,
  type DirectMessage,
  type RoomMember,
  type UserProfile,
  type Wallet,
  type Friend,
  type CallResult,
  type ClientToServerEvents,
  type HandshakeAuth,
  type PartnerLeftReason,
  type ServerToClientEvents,
} from '@rc/shared';
import type { AccountStore } from './accounts.ts';
import { Analytics, dayOf } from './analytics.ts';
import { PushService, type PushSender } from './push.ts';
import { Guard, looksLikeLink } from './guard.ts';
import { applyMove, newGame, viewFor, type GameState } from './games.ts';
import { Rooms, type RoomSeat } from './rooms.ts';
import { Razorpay } from './razorpay.ts';
import { LOW_TRUST, SkipTracker, trustScore } from './trust.ts';
import { Translator } from './translate.ts';
import { runWinback } from './winback.ts';
import { cors, RateLimiter, readJson, sendJson } from './http.ts';
import { isPlusActive, MAX_FRIENDS, MemoryAccountStore, NO_PLUS, type StoredMessage } from './accounts.ts';
import type { BillingProvider } from './billing.ts';
import { createBillingHandler } from './billing-http.ts';
import { handleAdmin } from './admin.ts';
import { ageHoldOf, createAuthHandler } from './auth.ts';
import { createGoogleHandler, type GoogleConfig } from './google.ts';
import { MatchLimits, type LimitOptions } from './limits.ts';
import { TurnCredentials, type TurnConfig } from './turn.ts';
import { ConsoleMailer, type Mailer } from './mailer.ts';
import { config } from './config.ts';
import { Matchmaker, type Pairing, type Session } from './matchmaker.ts';
import { banInfo, clientIp, hashIp, isDeviceId, parseReport, Safety, SNAPSHOT_RETENTION_MS } from './safety.ts';
import { MemoryStore, type SafetyStore } from './store.ts';
import { parseCallResult, parseChatText, parseJoin, parseProfile, parseSignal } from './validate.ts';

interface SocketData {
  deviceId: string;
  /** Boost end time from the account, at handshake. */
  boostUntil?: number | null;
  /** Logged-in account, from the handshake token. */
  userId: string | null;
  /** Sign-up time of that account. */
  accountCreatedAt?: number | null;
  /** The account has the ✓ Verified badge. */
  verified?: boolean;
  /** No invite reward can be due any more (checked on matches). */
  referralDone?: boolean;
  /** Chatting paused: under 18, or an underage report awaiting ✓ verification. */
  ageHold?: AgeHold;
  /** 0–100; below LOW_TRUST means the shadow pool. */
  trust?: number;
  /** Passed the proof-of-work check (a real browser, not a script). */
  human?: boolean;
  /** The proof-of-work challenge sent to this socket. */
  challenge?: string;
  /** Profile card shown to partners. */
  profile?: UserProfile;
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
      .catch((e) => console.error('[plus]', e));
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
      if (!(e instanceof SyntaxError)) console.error('[translate]', e);
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
                .catch((e) => console.error('[age]', e));
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
      console.error('[http]', e);
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
    if (deviceFirstSeen.size >= MAX_DEVICES) deviceFirstSeen.delete(deviceFirstSeen.keys().next().value!);
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
        console.error('[handshake]', e);
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
  /** False (and tells the client) when a free user has no matches left today. */
  const mayMatch = (socket: { data: SocketData; emit: IO['emit'] }) => {
    if (!limits || limits.canMatch(limitKey(socket.data), socket.data.plus)) return true;
    socket.emit('limit:reached', limits.status(limitKey(socket.data), false));
    analytics.count('limitHits');
    return false;
  };

  const rooms = new Rooms();
  const lastSeenWrite = new Map<string, number>();
  // Win-back emails every 6 hours (only with a real mailer).
  const winbackTimer = opts.winback
    ? setInterval(
        () =>
          void runWinback({
            accounts,
            mailer: opts.mailer!,
            webUrl: opts.webUrl ?? config.webUrl,
            serverUrl: opts.serverUrl ?? config.serverUrl,
            online: matchmaker.onlineCount,
          })
            .then((n) => n && console.log(`[winback] sent ${n}`))
            .catch((e) => console.error('[winback]', e)),
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
  const games = new Map<string, GameState>();

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
  };

  const profileOf = (socketId: string) => {
    const p = io.sockets.sockets.get(socketId)?.data.profile;
    return p ? { name: p.name || undefined, avatar: p.avatar, bio: p.bio } : {};
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
    for (const [x, y] of [[a.id, b.id], [b.id, a.id]]) void checkReferral(x, y).catch((e) => console.error('[referral]', e));
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
    if (matchStarted.size > 20_000) matchStarted.delete(matchStarted.keys().next().value!);
    for (const id of [a.id, b.id]) {
      const d = io.sockets.sockets.get(id)?.data;
      if (d) skips.matched(limitKey(d));
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
          if (friendMatches.size > 10_000) friendMatches.delete(friendMatches.values().next().value!);
          io.to(a.id).emit('friend:state', 'friends');
          io.to(b.id).emit('friend:state', 'friends');
        })
        .catch(() => undefined);
    }
  };

  io.on('connection', (socket) => {
    const { deviceId, ipHash, blocked, userId, plus, verified } = socket.data;
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
    /** A join that arrived before the proof; run once proven. */
    let pendingJoin: unknown = null;
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
      if (pendingJoin !== null) {
        const payload = pendingJoin;
        pendingJoin = null;
        for (const handler of socket.listeners('queue:join')) (handler as (p: unknown) => void)(payload);
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
    const allowEvent = guard.eventLimiter();
    socket.use(([event, ...args], next) => {
      const verdict = allowEvent(event);
      if (verdict === 'kick') {
        console.warn('[guard] flood, disconnecting', ipKey.slice(0, 12));
        // Cut off this browser for 5 minutes, and its IP briefly (shared IPs recover fast).
        guard.block(`d:${socket.data.deviceId}`);
        guard.block(ipKey, 60_000);
        socket.emit('guard:slow-down', { reason: 'flood', retryAfterMs: 5 * 60_000 });
        return void socket.disconnect(true);
      }
      if (verdict === 'drop') return;
      if (!socket.data.human && HUMAN_ONLY.has(event)) {
        if (event === 'queue:join') pendingJoin = args[0];
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
    void refreshTrust(socket.id).catch((e) => console.error('[trust]', e));
    // "Last seen" for win-back emails (at most hourly per user).
    if (socket.data.userId && Date.now() - (lastSeenWrite.get(socket.data.userId) ?? 0) > 3_600_000) {
      lastSeenWrite.set(socket.data.userId, Date.now());
      if (lastSeenWrite.size > 100_000) lastSeenWrite.clear();
      void accounts.touchLastSeen(socket.data.userId, Date.now()).catch(() => undefined);
    }
    const onlineUser = socket.data.userId;
    if (onlineUser && [...io.sockets.sockets.values()].filter((x) => x.data.userId === onlineUser).length === 1) {
      void notifyFriendsOnline(onlineUser).catch((e) => console.error('[push]', e));
    }
    analytics.peak('peakOnline', matchmaker.onlineCount);
    if (limits) socket.emit('limit:status', limits.status(limitKey(socket.data), plus));
    if (userId) void pushWallet(userId).catch(() => undefined);
    if (socket.data.ban) socket.emit('banned', socket.data.ban);
    const sentAt: number[] = [];
    const recentTexts: string[] = [];

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

    socket.on('queue:join', (payload) => {
      if (stillBanned()) return;
      const join = parseJoin(payload);
      if (!join) return void socket.emit('error:message', 'Invalid join request');
      if (matchmaker.get(socket.id)?.partnerId) return;
      if (pausedForSkipping()) return;
      if (!mayMatch(socket)) return;
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
      if (!matchmaker.get(socket.id) || stillBanned()) return;
      // Skipped within seconds: counts against the person skipped (see trust.ts).
      const current = matchmaker.get(socket.id)!;
      const skipped = matchmaker.partnerOf(socket.id);
      const started = current.matchId ? matchStarted.get(current.matchId) : undefined;
      if (skipped && started && Date.now() - started < 5_000) {
        const d = io.sockets.sockets.get(skipped.id)?.data;
        if (d) {
          skips.quickSkipped(limitKey(d));
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

    // ---- Coins: gifts, Boost, matches ----
    /** Spends coins from my account; replies with the new wallet or why not. */
    const spend = async (coins: number, reason: string): Promise<SpendResult> => {
      const me = socket.data.userId;
      if (!me) return { ok: false, reason: 'login' };
      const balance = await accounts.changeCoins(me, -coins, reason);
      if (balance === null) return { ok: false, reason: 'coins' };
      const w = (await pushWallet(me)) ?? { coins: balance, boostUntil: null };
      return { ok: true, wallet: w };
    };

    socket.on('gift:send', async (giftId, ack) => {
      const done = typeof ack === 'function' ? ack : () => undefined;
      const gift = availableGifts().find((g) => g.id === giftId);
      if (!gift) return done({ ok: false, reason: 'invalid' });
      const partner = matchmaker.partnerOf(socket.id);
      if (!partner) return done({ ok: false, reason: 'no-partner' });
      try {
        const r = await spend(gift.coins, `gift:${gift.id}`);
        if (!r.ok) return done(r);
        // The receiver earns a share if they have an account.
        const theirId = io.sockets.sockets.get(partner.id)?.data.userId;
        const earned = theirId ? Math.floor(gift.coins * GIFT_SHARE) : 0;
        if (theirId && earned) {
          await accounts.changeCoins(theirId, earned, `gift-received:${gift.id}`);
          void pushWallet(theirId);
        }
        socket.emit('gift', { giftId: gift.id, from: 'me', earned });
        io.to(partner.id).emit('gift', { giftId: gift.id, from: 'them', earned });
        analytics.count('gifts');
        done(r);
      } catch (e) {
        console.error('[gift]', e);
        done({ ok: false, reason: 'invalid' });
      }
    });

    socket.on('boost:buy', async (ack) => {
      const done = typeof ack === 'function' ? ack : () => undefined;
      try {
        const r = await spend(BOOST.coins, 'boost');
        if (!r.ok) return done(r);
        const me = socket.data.userId!;
        // Extends an active Boost.
        const current = (await accounts.userById(me))?.boostUntil ?? 0;
        const until = Math.max(Date.now(), current) + BOOST.minutes * 60_000;
        await accounts.setBoost(me, until);
        analytics.count('boosts');
        matchmaker.setBoost(me, until);
        const w = (await pushWallet(me))!;
        done({ ok: true, wallet: w });
      } catch (e) {
        console.error('[boost]', e);
        done({ ok: false, reason: 'invalid' });
      }
    });

    socket.on('match:priority', async (ack) => {
      const done = typeof ack === 'function' ? ack : () => undefined;
      const session = matchmaker.get(socket.id);
      if (!session || session.partnerId || session.priority || priorityTimers.has(socket.id) || stillBanned()) {
        return done({ ok: false, reason: 'invalid' });
      }
      try {
        const r = await spend(PRIORITY_MATCH.coins, 'priority');
        if (!r.ok) return done(r);
        analytics.count('priorityMatches');
        const me = socket.data.userId!;
        // No verified person in time: give the coins back.
        priorityTimers.set(
          socket.id,
          setTimeout(() => {
            priorityTimers.delete(socket.id);
            matchmaker.setPriority(socket.id, false);
            void accounts
              .changeCoins(me, PRIORITY_MATCH.coins, 'priority-refund')
              .then(() => pushWallet(me))
              .catch((e) => console.error('[priority]', e));
            socket.emit('priority:expired');
          }, opts.priorityWaitMs ?? PRIORITY_MATCH.waitMinutes * 60_000),
        );
        done(r);
        const pairing = matchmaker.setPriority(socket.id, true);
        if (pairing) announce(pairing);
      } catch (e) {
        console.error('[priority]', e);
        done({ ok: false, reason: 'invalid' });
      }
    });

    socket.on('limit:buy', async (ack) => {
      const done = typeof ack === 'function' ? ack : () => undefined;
      if (!limits) return done({ ok: false, reason: 'invalid' });
      try {
        const r = await spend(MATCHES_FOR_COINS.coins, 'matches');
        if (!r.ok) return done(r);
        const key = limitKey(socket.data);
        limits.addBonus(key, MATCHES_FOR_COINS.matches);
        socket.emit('limit:granted', limits.status(key, socket.data.plus));
        done(r);
      } catch (e) {
        console.error('[limit:buy]', e);
        done({ ok: false, reason: 'invalid' });
      }
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

    // ---- Group rooms ----
    const roomPeers = (except?: string) => (rooms.roomOf(socket.id)?.seats ?? []).filter((x) => x.socketId !== except);
    const memberView = (x: RoomSeat): RoomMember => ({ id: x.id, name: x.name, gender: x.gender, avatar: x.avatar, country: x.country, verified: x.verified });
    const leaveRoom = () => {
      const left = rooms.leave(socket.id);
      if (left) for (const x of left.room.seats) io.to(x.socketId).emit('room:member-left', left.seat.id);
    };
    socket.on('rooms:list', (ack) => {
      if (typeof ack === 'function') ack(rooms.counts());
    });
    socket.on('room:join', (topic, mode, gender, ack) => {
      if (typeof ack !== 'function') return;
      if (!socket.data.userId) return ack({ ok: false, reason: 'login-required' });
      if (stillBanned()) return ack({ ok: false, reason: 'banned' });
      if (!TOPICS.some((t) => t.id === topic) || (mode !== 'video' && mode !== 'voice') || !['male', 'female', 'couple'].includes(gender)) {
        return ack({ ok: false, reason: 'invalid' });
      }
      // A room replaces any one-to-one chat.
      matchmaker.leaveQueue(socket.id);
      notifyLeft(matchmaker.endMatch(socket.id)?.id, 'stop');
      const me = matchmaker.get(socket.id);
      const myDevice = socket.data.deviceId;
      const blockedPair = (a: string, b: string) => {
        const other = a === myDevice ? b : a;
        const otherSocket = [...io.sockets.sockets.values()].find((x) => x.data.deviceId === other);
        return socket.data.blocked.has(other) || !!otherSocket?.data.blocked.has(myDevice);
      };
      const { room, seat } = rooms.join(
        {
          socketId: socket.id,
          deviceId: myDevice,
          gender,
          name: socket.data.profile?.name ?? '',
          avatar: socket.data.profile?.avatar ?? null,
          country: me && !me.hideCountry ? me.country : null,
          verified: !!socket.data.verified,
        },
        topic,
        mode,
        blockedPair,
      );
      analytics.count('roomJoins');
      ack({ ok: true, roomId: room.id, you: seat.id, members: roomPeers(socket.id).map(memberView), iceServers: turn.current(), mode });
      for (const x of roomPeers(socket.id)) io.to(x.socketId).emit('room:member-joined', memberView(seat));
    });
    socket.on('room:leave', leaveRoom);
    socket.on('disconnect', leaveRoom);
    socket.on('room:signal', (to, payload) => {
      const me = rooms.seatOf(socket.id);
      const target = roomPeers(socket.id).find((x) => x.id === to);
      const msg = parseSignal(payload);
      if (me && target && msg) io.to(target.socketId).emit('room:signal', { from: me.id, msg });
    });
    socket.on('room:chat', (payload) => {
      const me = rooms.seatOf(socket.id);
      const text = parseChatText(payload);
      if (!me || !text) return;
      if (looksLikeLink(text)) return void socket.emit('chat:rejected', 'link');
      const chat = { from: me.id, text, at: Date.now() };
      for (const x of rooms.roomOf(socket.id)!.seats) io.to(x.socketId).emit('room:chat', chat);
    });
    socket.on('room:report', async (memberId, reason) => {
      const target = roomPeers(socket.id).find((x) => x.id === memberId);
      if (!target || !REPORT_REASONS.includes(reason)) return;
      const now = Date.now();
      const times = socket.data.reportsAt;
      while (times.length && now - times[0]! > REPORT_WINDOW_MS) times.shift();
      if (times.length >= REPORT_BURST) return;
      times.push(now);
      const t = io.sockets.sockets.get(target.socketId)?.data;
      if (!t) return;
      try {
        await safety.report(
          { deviceId: socket.data.deviceId, ipHash: socket.data.ipHash, userId: socket.data.userId },
          { deviceId: t.deviceId, ipHash: t.ipHash, userId: t.userId },
          { target: 'current', reason, source: 'user', note: 'Reported in a group room' },
        );
        analytics.count('reports');
        void refreshTrust(target.socketId).catch(() => undefined);
        // Block them so you're never put in a room (or chat) together again.
        await store.addBlock(socket.data.deviceId, t.deviceId).catch(() => undefined);
        matchmaker.block(socket.data.deviceId, t.deviceId);
        socket.data.blocked.add(t.deviceId);
      } catch (e) {
        console.error('[room:report]', e);
      }
    });

    // ---- Mini-games (the server keeps the board so both see the same thing) ----
    const sendGame = (matchId: string, a: string, b: string) => {
      const entry = games.get(matchId);
      io.to(a).emit('game:state', entry ? viewFor(entry, a) : null);
      io.to(b).emit('game:state', entry ? viewFor(entry, b) : null);
    };
    socket.on('game:start', (game) => {
      const partner = matchmaker.partnerOf(socket.id);
      const matchId = matchmaker.get(socket.id)?.matchId;
      if (!partner || !matchId || !GAMES.some((g) => g.id === game)) return;
      games.set(matchId, newGame(game, socket.id, partner.id));
      if (games.size > 5_000) games.delete(games.keys().next().value!);
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
      games.set(matchId, next);
      sendGame(matchId, socket.id, partner.id);
    });
    socket.on('game:end', () => {
      const partner = matchmaker.partnerOf(socket.id);
      const matchId = matchmaker.get(socket.id)?.matchId;
      if (!partner || !matchId || !games.delete(matchId)) return;
      sendGame(matchId, socket.id, partner.id);
    });

    const reactionsAt: number[] = [];
    socket.on('reaction', (emoji) => {
      if (!(REACTIONS as readonly string[]).includes(emoji)) return;
      const partner = matchmaker.partnerOf(socket.id);
      if (!partner) return;
      // At most 8 reactions per 4 s.
      const now = Date.now();
      while (reactionsAt.length && now - reactionsAt[0] > 4_000) reactionsAt.shift();
      if (reactionsAt.length >= 8) return;
      reactionsAt.push(now);
      io.to(partner.id).emit('reaction', emoji);
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

      const me = matchmaker.get(socket.id)!;
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

    socket.on('users:call', (publicId, ack) => {
      if (typeof ack !== 'function') return;
      if (!socket.data.plus) return ack({ ok: false, reason: 'plus-required' });
      const target = typeof publicId === 'string' ? matchmaker.byPublicId(publicId) : undefined;
      if (!target) return ack({ ok: false, reason: 'gone' });
      ack(startRequest(target, false));
    });

    // ---- Friends (accounts only) ----
    const myUser = () => socket.data.userId;
    /** Opaque per-user handle for a friend, so account ids never reach the browser. */
    const friendHandle = (friendId: string) => createHash('sha256').update(`f:${myUser()}:${friendId}`).digest('base64url').slice(0, 16);
    const resolveFriend = async (handle: unknown) => {
      const me = myUser();
      if (!me || typeof handle !== 'string') return null;
      return (await accounts.listFriends(me)).find((f) => friendHandle(f.friendId) === handle) ?? null;
    };
    /** The best socket of a user: a free one in the call screen first. */
    const socketsOfUser = (userId: string) => [...io.sockets.sockets.values()].filter((x) => x.data.userId === userId);

    socket.on('friend:add', async () => {
      const partner = matchmaker.partnerOf(socket.id);
      const me = matchmaker.get(socket.id);
      if (!partner || !me?.matchId) return;
      const myId = myUser();
      const partnerSocket = io.sockets.sockets.get(partner.id);
      const theirId = partnerSocket?.data.userId ?? null;
      if (!myId) return void socket.emit('friend:state', 'login-required');
      if (!theirId) return void socket.emit('friend:state', 'partner-guest');
      try {
        if (await accounts.isFriend(myId, theirId)) {
          socket.emit('friend:state', 'friends');
          return;
        }
        if ((await accounts.listFriends(myId)).length >= MAX_FRIENDS) return void socket.emit('friend:state', 'full');
        const wants = friendWants.get(me.matchId) ?? new Set<string>();
        wants.add(myId);
        friendWants.set(me.matchId, wants);
        if (!wants.has(theirId)) {
          socket.emit('friend:state', 'requested');
          io.to(partner.id).emit('friend:state', 'they-requested');
          return;
        }
        friendWants.delete(me.matchId);
        const seen = (s: Session) => ({ gender: s.gender, country: s.hideCountry ? null : s.country });
        await accounts.addFriend(myId, theirId, seen(partner));
        await accounts.addFriend(theirId, myId, seen(me));
        socket.emit('friend:state', 'friends');
        io.to(partner.id).emit('friend:state', 'friends');
      } catch (e) {
        console.error('[friend:add]', e);
      }
    });

    socket.on('friends:list', async (ack) => {
      if (typeof ack !== 'function') return;
      const me = myUser();
      if (!me) return ack(null);
      try {
        const [list, unread] = await Promise.all([accounts.listFriends(me), accounts.unreadCounts(me)]);
        ack(
          list.map((f) => {
            const socks = socketsOfUser(f.friendId);
            const sessions = socks.map((x) => matchmaker.get(x.id)).filter((x): x is Session => !!x);
            const status: Friend['status'] = sessions.some((x) => x.joined && !x.partnerId)
              ? 'available'
              : sessions.some((x) => x.partnerId)
                ? 'in-call'
                : socks.length
                  ? 'online'
                  : 'offline';
            return {
              id: friendHandle(f.friendId),
              nickname: f.nickname,
              gender: (f.gender as Friend['gender']) ?? null,
              country: f.country,
              since: f.createdAt,
              status,
              unread: unread.get(f.friendId) ?? 0,
            };
          }),
        );
      } catch (e) {
        console.error('[friends:list]', e);
        ack([]);
      }
    });

    // ---- Messages between friends (kept until read, pushed when they're away) ----
    const dmView = (m: StoredMessage, me: string): DirectMessage => ({ id: m.id, fromMe: m.from === me, text: m.text, at: m.at });
    socket.on('dm:send', async (handle, text, ack) => {
      if (typeof ack !== 'function') return;
      const me = myUser();
      if (!me) return ack({ ok: false, reason: 'login-required' });
      const clean = parseChatText(text);
      if (!clean) return ack({ ok: false, reason: 'invalid' });
      try {
        const f = await resolveFriend(handle);
        if (!f) return ack({ ok: false, reason: 'not-friends' });
        const stored = await accounts.addMessage(me, f.friendId, clean);
        ack({ ok: true, message: dmView(stored, me) });
        const theirSockets = socketsOfUser(f.friendId);
        for (const x of theirSockets) x.emit('dm:new', { friendId: friendHandleFor(f.friendId, me), message: dmView(stored, f.friendId) });
        // Your other tabs see it too.
        for (const x of socketsOfUser(me)) if (x.id !== socket.id) x.emit('dm:new', { friendId: handle as string, message: dmView(stored, me) });
        if (!theirSockets.length) {
          const theirs = (await accounts.listFriends(f.friendId)).find((x) => x.friendId === me);
          void push.send(f.friendId, {
            title: `💬 ${theirs?.nickname || 'A friend'}`,
            body: clean.length > 120 ? `${clean.slice(0, 117)}…` : clean,
            url: '/?friends=1',
            tag: `dm-${friendHandleFor(f.friendId, me)}`,
          });
        }
      } catch (e) {
        console.error('[dm:send]', e);
        ack({ ok: false, reason: 'invalid' });
      }
    });
    socket.on('dm:history', async (handle, ack) => {
      if (typeof ack !== 'function') return;
      const me = myUser();
      if (!me) return ack(null);
      try {
        const f = await resolveFriend(handle);
        if (!f) return ack(null);
        const messages = await accounts.messagesBetween(me, f.friendId, 50);
        await accounts.markRead(me, f.friendId);
        ack(messages.map((m) => dmView(m, me)));
      } catch (e) {
        console.error('[dm:history]', e);
        ack(null);
      }
    });

    socket.on('friends:call', async (handle, ack) => {
      if (typeof ack !== 'function') return;
      if (!myUser()) return ack({ ok: false, reason: 'login-required' });
      const f = await resolveFriend(handle).catch(() => null);
      if (!f) return ack({ ok: false, reason: 'gone' });
      const sessions = socketsOfUser(f.friendId)
        .map((x) => matchmaker.get(x.id))
        .filter((x): x is Session => !!x);
      const target = sessions.find((x) => x.joined && !x.partnerId);
      if (!target) return ack({ ok: false, reason: sessions.length ? (sessions.some((x) => x.partnerId) ? 'busy' : 'offline') : 'offline' });
      // Their nickname for me, so they see who is calling.
      const theirs = await accounts.listFriends(f.friendId).catch(() => []);
      ack(startRequest(target, true, theirs.find((x) => x.friendId === myUser())?.nickname ?? ''));
    });

    socket.on('friends:remove', async (handle, ack) => {
      const done = typeof ack === 'function' ? ack : () => undefined;
      const f = await resolveFriend(handle).catch(() => null);
      if (!f) return done(false);
      await accounts.removeFriendship(myUser()!, f.friendId).catch(() => undefined);
      done(true);
    });

    socket.on('friends:rename', async (handle, nickname, ack) => {
      const done = typeof ack === 'function' ? ack : () => undefined;
      const f = await resolveFriend(handle).catch(() => null);
      if (!f || typeof nickname !== 'string') return done(false);
      const clean = nickname.trim().slice(0, MAX_FRIEND_NICKNAME) || null;
      await accounts.renameFriend(myUser()!, f.friendId, clean).catch(() => undefined);
      done(true);
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

    socket.on('limit:ad-start', () => {
      if (!limits) return;
      const result = limits.startAd(limitKey(socket.data));
      if (result !== 'ok') socket.emit('limit:ad-rejected', result);
    });

    socket.on('limit:ad-done', () => {
      if (!limits) return;
      const key = limitKey(socket.data);
      const result = limits.finishAd(key);
      if (result === 'ok') {
        socket.emit('limit:granted', limits.status(key, socket.data.plus));
        analytics.count('adsWatched');
      } else socket.emit('limit:ad-rejected', result);
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
        analytics.count('reports');
        if (targetId) void refreshTrust(targetId).catch(() => undefined);
        // Reported as underage: pause their account until they pass ✓ verification.
        if (report.reason === 'underage' && target.userId) {
          const t = await accounts.userById(target.userId);
          if (t && !t.verifiedAt) {
            await accounts.setAgeReview(t.id, true);
            setAgeHold(t.id, 'review');
          }
        }
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
      // Remember what the blocker saw, for their Blocked list.
      const seen = targetId ? matchmaker.get(targetId) : undefined;
      const info = { gender: seen?.gender ?? null, country: seen && !seen.hideCountry ? seen.country : null };
      await store.addBlock(deviceId, target.deviceId, info).catch((e) => console.error('[block]', e));
      // Blocking a friend also ends the friendship.
      if (socket.data.userId && target.userId) await accounts.removeFriendship(socket.data.userId, target.userId).catch(() => undefined);
      matchmaker.block(deviceId, target.deviceId);
      socket.emit('user:blocked');
      if (which === 'current' && matchmaker.get(socket.id)?.partnerId === targetId) {
        notifyLeft(matchmaker.endMatch(socket.id)?.id, 'next');
        const pairing = matchmaker.rejoin(socket.id);
        if (pairing) announce(pairing);
        else socket.emit('queue:waiting');
      }
    });

    /** Opaque handle for a block, so the other device's id never reaches the browser. */
    const blockHandle = (blocked: string) => createHash('sha256').update(`${deviceId}:${blocked}`).digest('base64url').slice(0, 16);

    socket.on('blocks:list', async (ack) => {
      if (typeof ack !== 'function') return;
      const list = await store.listBlocks(deviceId).catch(() => []);
      ack(
        list.map((b) => ({
          id: blockHandle(b.blocked),
          gender: (b.gender as BlockedUser['gender']) ?? null,
          country: b.country,
          createdAt: b.createdAt,
        })),
      );
    });

    socket.on('blocks:remove', async (id, ack) => {
      const done = typeof ack === 'function' ? ack : () => undefined;
      if (typeof id !== 'string') return done(false);
      try {
        const match = (await store.listBlocks(deviceId)).find((b) => blockHandle(b.blocked) === id);
        if (!match || !(await store.removeBlock(deviceId, match.blocked))) return done(false);
        // Refresh both sides' live block lists (they may still block each other the other way).
        for (const dev of [deviceId, match.blocked]) {
          const set = await store.blocksFor(dev);
          matchmaker.setBlocked(dev, set);
          for (const s of io.sockets.sockets.values()) if (s.data.deviceId === dev) s.data.blocked = set;
        }
        done(true);
      } catch (e) {
        console.error('[unblock]', e);
        done(false);
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
      turn.stop();
      for (const r of callRequests.values()) clearTimeout(r.timer);
      for (const t of priorityTimers.values()) clearTimeout(t);
      if (winbackTimer) clearInterval(winbackTimer);
      clearInterval(purgeTimer);
      await analytics.stop();
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
