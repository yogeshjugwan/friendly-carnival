/**
 * Trust score (0–100) for matching. People with low trust are put in a quiet
 * "shadow pool": they're only matched with each other, so repeat offenders
 * stop reaching everyone else without being told (which would only teach them
 * to make a new account). Bans still handle the clear-cut cases.
 */
export interface TrustSignals {
  verified: boolean;
  loggedIn: boolean;
  accountAgeMs: number | null;
  /** Different people who reported them in the last 7 days. */
  reporters7d: number;
  /** Different people they met recently, and how many of those skipped them within seconds. */
  matches24h: number;
  quickSkips24h: number;
}

export const LOW_TRUST = 25;
const DAY = 86_400_000;

export function trustScore(s: TrustSignals): number {
  let score = 50;
  if (s.verified) score += 25;
  if (s.loggedIn) score += 5;
  if (s.accountAgeMs !== null && s.accountAgeMs > 7 * DAY) score += 10;
  // 3 reporters in 24 h is an automatic ban (safety.ts); 3 spread over the week lands here.
  score -= 12 * Math.min(s.reporters7d, 5);
  // Almost everyone skips them right away (spam, nudity flashing, abuse).
  if (s.matches24h >= 15 && s.quickSkips24h / s.matches24h >= 0.8) score -= 30;
  return Math.max(0, Math.min(100, score));
}

/**
 * Matches and "skipped within seconds" per person over the last 24 h (in memory).
 * Counted per different partner, so two people skipping each other over and
 * over (friends testing, or a tiny queue) can't push either into the shadow pool.
 */
export class SkipTracker {
  private matches = new Map<string, Map<string, number>>();
  private skips = new Map<string, Map<string, number>>();

  constructor(private readonly now: () => number = Date.now) {}

  private add(map: Map<string, Map<string, number>>, key: string, other: string) {
    const t = this.now();
    const byOther = map.get(key) ?? new Map<string, number>();
    for (const [k, at] of byOther) if (t - at >= DAY) byOther.delete(k);
    byOther.delete(other); // re-insert so the newest stays last
    byOther.set(other, t);
    if (byOther.size > 200) byOther.delete(byOther.keys().next().value!);
    map.set(key, byOther);
    if (map.size > 100_000) map.clear();
  }

  private count(map: Map<string, Map<string, number>>, key: string) {
    const t = this.now();
    let n = 0;
    for (const at of map.get(key)?.values() ?? []) if (t - at < DAY) n++;
    return n;
  }

  matched(key: string, partner: string) {
    this.add(this.matches, key, partner);
  }

  quickSkipped(key: string, by: string) {
    this.add(this.skips, key, by);
  }

  stats(key: string) {
    return { matches24h: this.count(this.matches, key), quickSkips24h: this.count(this.skips, key) };
  }
}
