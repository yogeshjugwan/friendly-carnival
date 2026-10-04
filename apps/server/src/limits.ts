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

  status(key: string, unlimited: boolean): MatchLimitStatus {
    const e = this.entry(key);
    const limit = this.opts.daily + e.bonus;
    return {
      unlimited,
      used: e.used,
      limit,
      remaining: Math.max(0, limit - e.used),
      adsLeft: Math.max(0, this.opts.maxAds - e.ads),
      adBonus: this.opts.adBonus,
      adMs: this.opts.adMs,
      resetsAt: nextMidnight(this.now()),
    };
  }

  canMatch(key: string, unlimited: boolean): boolean {
    if (unlimited) return true;
    const e = this.entry(key);
    return e.used < this.opts.daily + e.bonus;
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
