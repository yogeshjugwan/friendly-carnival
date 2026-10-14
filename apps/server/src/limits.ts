import type { MatchLimitStatus } from '@rc/shared';

export interface LimitOptions {
  /** Free matches per day. */
  daily: number;
  /** Matches added by one rewarded video. */
  adBonus: number;
  /** Rewarded videos allowed per day. */
  maxAds: number;
  /** Minimum time between ad start and ad done. */
  adMs: number;
  /** Free video/voice call time before a break (0 or unset: no time limit). */
  callMs?: number;
  /** Length of that break. */
  breakMs?: number;
}

interface TimeEntry {
  usedMs: number;
  breakUntil: number | null;
}

interface Entry {
  day: string;
  used: number;
  bonus: number;
  ads: number;
  adStartedAt: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const nextMidnight = (t: number) => Math.floor(t / DAY_MS) * DAY_MS + DAY_MS;

/**
 * Daily match allowance for free users, counted per account (or per browser for
 * guests). Plus users are never limited. In memory: it resets on restart, which
 * only ever gives people more matches.
 */
export class MatchLimits {
  private entries = new Map<string, Entry>();
  /** Call time: N hours free, then a break, then N hours again (not tied to the day). */
  private time = new Map<string, TimeEntry>();

  constructor(
    readonly opts: LimitOptions,
    private readonly now: () => number = Date.now,
  ) {}

  private entry(key: string): Entry {
    const day = dayOf(this.now());
    let e = this.entries.get(key);
    if (!e || e.day !== day) {
      e = { day, used: 0, bonus: 0, ads: 0, adStartedAt: null };
      this.entries.set(key, e);
      if (this.entries.size > 200_000) this.prune(day);
    }
    return e;
  }

  private prune(today: string) {
    for (const [k, v] of this.entries) if (v.day !== today) this.entries.delete(k);
  }

  private timeEntry(key: string): TimeEntry {
    let t = this.time.get(key);
    if (!t) {
      t = { usedMs: 0, breakUntil: null };
      this.time.set(key, t);
      if (this.time.size > 200_000) for (const [k, v] of this.time) if (v.usedMs === 0 && v.breakUntil === null) this.time.delete(k);
    }
    // Break over: a fresh stretch of free time.
    if (t.breakUntil !== null && t.breakUntil <= this.now()) {
      t.usedMs = 0;
      t.breakUntil = null;
    }
    return t;
  }

  private get timed() {
    return (this.opts.callMs ?? 0) > 0;
  }

  /** When the current break ends, or null if not on a break. */
  breakUntil(key: string): number | null {
    return this.timed ? this.timeEntry(key).breakUntil : null;
  }

  /** Free call time left before a break, ms (Infinity without a time limit). */
  callMsLeft(key: string): number {
    if (!this.timed) return Infinity;
    const t = this.timeEntry(key);
    return t.breakUntil !== null ? 0 : Math.max(0, this.opts.callMs! - t.usedMs);
  }

  /** Adds finished call time; using up the free time starts the break. */
  addCallTime(key: string, ms: number) {
    if (!this.timed || ms <= 0) return;
    const t = this.timeEntry(key);
    if (t.breakUntil !== null) return;
    t.usedMs += ms;
    if (t.usedMs >= this.opts.callMs!) t.breakUntil = this.now() + (this.opts.breakMs ?? 0);
  }

  status(key: string, unlimited: boolean): MatchLimitStatus {
    const e = this.entry(key);
    const limit = this.opts.daily + e.bonus;
    const left = this.callMsLeft(key);
    return {
      unlimited,
      used: e.used,
      limit,
      remaining: Math.max(0, limit - e.used),
      adsLeft: Math.max(0, this.opts.maxAds - e.ads),
      adBonus: this.opts.adBonus,
      adMs: this.opts.adMs,
      resetsAt: nextMidnight(this.now()),
      callMsLeft: unlimited || left === Infinity ? null : left,
      breakUntil: unlimited ? null : this.breakUntil(key),
      callMs: this.opts.callMs ?? 0,
      breakMs: this.opts.breakMs ?? 0,
    };
  }

  /** Free matches left, and (for video/voice) not on a call-time break. */
  canMatch(key: string, unlimited: boolean, mode: 'video' | 'voice' | 'text' = 'video'): boolean {
    if (unlimited) return true;
    const e = this.entry(key);
    if (e.used >= this.opts.daily + e.bonus) return false;
    return mode === 'text' || this.breakUntil(key) === null;
  }

  /** Extra matches for today (bought with coins). */
  addBonus(key: string, matches: number) {
    this.entry(key).bonus += matches;
  }

  /** Records one match. */
  count(key: string) {
    this.entry(key).used++;
  }

  startAd(key: string): 'ok' | 'no-ads-left' {
    const e = this.entry(key);
    if (e.ads >= this.opts.maxAds) return 'no-ads-left';
    e.adStartedAt = this.now();
    return 'ok';
  }

  /** Grants the bonus when the video really played for adMs. */
  finishAd(key: string): 'ok' | 'too-soon' | 'no-ads-left' | 'not-started' {
    const e = this.entry(key);
    if (e.adStartedAt === null) return 'not-started';
    if (e.ads >= this.opts.maxAds) return 'no-ads-left';
    // Small allowance for network and timer jitter.
    if (this.now() - e.adStartedAt < this.opts.adMs - 1_000) return 'too-soon';
    e.adStartedAt = null;
    e.ads++;
    e.bonus += this.opts.adBonus;
    return 'ok';
  }
}
