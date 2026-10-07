import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { leadingZeroBits, type GuardChallenge } from '@rc/shared';

/**
 * The shield against bots and floods:
 *  - proof of work before matching (gets harder for IPs opening many connections),
 *  - connection-rate caps per IP and temporary blocks for flooding devices,
 *  - per-socket event rate limits (token buckets),
 *  - a brake on skipping through people too fast,
 *  - cooldowns so declined call requests can't be looped,
 *  - link / social-handle and repeated-message filters for chats with strangers.
 */

const CHALLENGE_TTL_MS = 5 * 60_000;
const CONNECT_WINDOW_MS = 10 * 60_000;

/** Proof-of-work difficulty by how many connections the IP opened in the last 10 minutes. */
export function powBits(recentConnections: number, base = 16): number {
  if (recentConnections > 150) return base + 6;
  if (recentConnections > 60) return base + 4;
  if (recentConnections > 20) return base + 2;
  return base;
}

/** [burst, refill per second] for each client event; anything else uses `default`. */
export const EVENT_LIMITS: Record<string, [number, number]> = {
  signal: [400, 40],
  'relay:chunk': [80, 12],
  'chat:typing': [40, 4],
  'chat:message': [20, 1],
  reaction: [20, 2],
  icebreaker: [5, 0.25],
  'queue:join': [10, 0.5],
  'call:next': [15, 0.5],
  'call:skip': [15, 0.5],
  'call:back': [10, 0.2],
  'users:call': [5, 0.1],
  'friends:call': [5, 0.1],
  'users:list': [20, 0.5],
  'friends:list': [20, 0.5],
  'report:submit': [10, 0.1],
  'user:block': [10, 0.1],
  'gift:send': [10, 0.5],
  default: [60, 5],
};
/** Dropped events before the socket is cut off. */
const STRIKES_TO_KICK = 60;
const KICK_BLOCK_MS = 5 * 60_000;

/** Skipping brake: more matches than this in the window pauses matching. */
const SKIP_WINDOW_MS = 2 * 60_000;
const SKIP_MAX = 40;
const SKIP_PAUSE_MS = 30_000;

/** A declined / unanswered call request blocks the same pair for this long. */
const CALL_COOLDOWN_MS = 3 * 60_000;
/** At most this many incoming requests per person per 10 minutes. */
const MAX_INCOMING = 10;

export type EventVerdict = 'ok' | 'drop' | 'kick';

export class Guard {
  private readonly secret = randomBytes(32);
  private used = new Map<string, number>();
  private connects = new Map<string, number[]>();
  private blocked = new Map<string, number>();
  private matches = new Map<string, number[]>();
  private paused = new Map<string, number>();
  private callCooldown = new Map<string, number>();
  private incoming = new Map<string, number[]>();

  constructor(
    private readonly opts: { baseBits?: number; maxConnectsPer10Min?: number; now?: () => number } = {},
  ) {}

  private now() {
    return (this.opts.now ?? Date.now)();
  }

  /** Recent timestamps in a window, pruned; optionally adds now. */
  private window(map: Map<string, number[]>, key: string, ms: number, add: boolean): number[] {
    const now = this.now();
    const list = (map.get(key) ?? []).filter((t) => now - t < ms);
    if (add) list.push(now);
    if (list.length) map.set(key, list);
    else map.delete(key);
    if (map.size > 100_000) map.clear(); // memory guard under attack
    return list;
  }

  // ---- connections ----

  /** Counts a new connection from an IP; false when it's flooding or temporarily blocked. */
  allowConnection(ipKey: string, deviceKey: string): boolean {
    const now = this.now();
    for (const key of [ipKey, deviceKey]) {
      const until = this.blocked.get(key);
      if (until && until > now) return false;
      if (until) this.blocked.delete(key);
    }
    const n = this.window(this.connects, ipKey, CONNECT_WINDOW_MS, true).length;
    return n <= (this.opts.maxConnectsPer10Min ?? 600);
  }

  block(key: string, ms = KICK_BLOCK_MS) {
    this.blocked.set(key, this.now() + ms);
  }

  // ---- proof of work ----

  private sign(body: string) {
    return createHmac('sha256', this.secret).update(body).digest('base64url').slice(0, 22);
  }

  challenge(ipKey: string): GuardChallenge {
    const recent = this.window(this.connects, ipKey, CONNECT_WINDOW_MS, false).length;
    const bits = powBits(recent, this.opts.baseBits);
    const body = `${this.now()}.${randomBytes(12).toString('base64url')}.${bits}`;
    return { challenge: `${body}.${this.sign(body)}`, bits };
  }

  /** Checks a solved challenge (each one works once, for 5 minutes). */
  verify(challenge: unknown, nonce: unknown): boolean {
    if (typeof challenge !== 'string' || typeof nonce !== 'string' || nonce.length > 32 || challenge.length > 120) return false;
    const parts = challenge.split('.');
    if (parts.length !== 4) return false;
    const [ts, , bitsText, sig] = parts as [string, string, string, string];
    const body = parts.slice(0, 3).join('.');
    const expected = Buffer.from(this.sign(body));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
    const now = this.now();
    if (now - Number(ts) > CHALLENGE_TTL_MS || this.used.has(challenge)) return false;
    const hash = createHash('sha256').update(`${challenge}:${nonce}`).digest();
    if (leadingZeroBits(hash) < Number(bitsText)) return false;
    this.used.set(challenge, now);
    if (this.used.size > 50_000) for (const [c, t] of this.used) if (now - t > CHALLENGE_TTL_MS) this.used.delete(c);
    return true;
  }

  // ---- per-socket event limits ----

  /** A rate limiter for one socket: call it with each incoming event name. */
  eventLimiter(): (event: string) => EventVerdict {
    const buckets = new Map<string, { tokens: number; at: number }>();
    let strikes = 0;
    return (event) => {
      const [burst, perSec] = EVENT_LIMITS[event] ?? EVENT_LIMITS.default!;
      const now = this.now();
      const b = buckets.get(event) ?? { tokens: burst, at: now };
      b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 1000) * perSec);
      b.at = now;
      buckets.set(event, b);
      if (b.tokens >= 1) {
        b.tokens -= 1;
        return 'ok';
      }
      strikes++;
      return strikes >= STRIKES_TO_KICK ? 'kick' : 'drop';
    };
  }

  // ---- skipping brake ----

  /** Records a match for a person; returns how long to pause them, or 0. */
  noteMatch(personKey: string): number {
    const n = this.window(this.matches, personKey, SKIP_WINDOW_MS, true).length;
    if (n > SKIP_MAX) {
      this.paused.set(personKey, this.now() + SKIP_PAUSE_MS);
      this.matches.delete(personKey);
      return SKIP_PAUSE_MS;
    }
    return 0;
  }

  /** Remaining pause for a person who skipped too fast, or 0. */
  pausedFor(personKey: string): number {
    const until = this.paused.get(personKey) ?? 0;
    const left = until - this.now();
    if (left <= 0) this.paused.delete(personKey);
    return Math.max(0, left);
  }

  // ---- call requests ----

  /** 'ok', or why this caller can't ring this person right now. */
  canRequest(callerKey: string, calleeKey: string): 'ok' | 'cooldown' | 'busy' {
    const until = this.callCooldown.get(`${callerKey}>${calleeKey}`) ?? 0;
    if (until > this.now()) return 'cooldown';
    if (this.window(this.incoming, calleeKey, CONNECT_WINDOW_MS, false).length >= MAX_INCOMING) return 'busy';
    return 'ok';
  }

  noteRequest(calleeKey: string) {
    this.window(this.incoming, calleeKey, CONNECT_WINDOW_MS, true);
  }

  /** The callee said no (or didn't answer): don't let the caller ring them again for a while. */
  noteDeclined(callerKey: string, calleeKey: string) {
    const now = this.now();
    this.callCooldown.set(`${callerKey}>${calleeKey}`, now + CALL_COOLDOWN_MS);
    if (this.callCooldown.size > 50_000) for (const [k, t] of this.callCooldown) if (t < now) this.callCooldown.delete(k);
  }
}

// ---- chat content ----

const LINK =
  /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\s?(\.|\(dot\)|\[dot\])\s?(com|net|org|io|me|ly|gg|xyz|in|co|app|link|site|online|ru|tk|top|info|biz|live|club|vip|fun|shop)\b|t\.me\/|wa\.me\/|\bonlyfans\b|\bsnap(chat)?\s*[:@-]|\binsta(gram)?\s*[:@-]|\btelegram\s*[:@-]|\bwhats\s?app\s*[:@+-]|(^|\s)@[a-z0-9_.]{3,})/i;

/** Links, social handles and contact-me spam that bots post to strangers. */
export const looksLikeLink = (text: string) => LINK.test(text);
