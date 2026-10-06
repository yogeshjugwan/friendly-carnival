import type { SafetyStore } from './store.ts';

/** Days are in IST (UTC+5:30), where most users are; override with STATS_UTC_OFFSET_MIN. */
const OFFSET_MS = (Number(process.env.STATS_UTC_OFFSET_MIN ?? 330) || 0) * 60_000;
export const dayOf = (ms: number) => new Date(ms + OFFSET_MS).toISOString().slice(0, 10);

const FLUSH_MS = 5 * 60_000;

/**
 * Today's counters (visitors, matches, peak online, …), kept in memory and
 * saved every few minutes. Unique visitors are counted per process, so a
 * restart can count someone twice — good enough for trends.
 */
export class Analytics {
  private day: string;
  private values: Record<string, number> = {};
  private visitors = new Set<string>();
  private visitorBase = 0;
  private dirty = false;
  private timer: NodeJS.Timeout | null = null;
  private ready: Promise<void>;

  constructor(
    private readonly store: SafetyStore,
    private readonly now: () => number = Date.now,
  ) {
    this.day = dayOf(this.now());
    this.ready = this.load(this.day);
  }

  private async load(day: string) {
    const saved = await this.store.loadStats(day).catch(() => ({}) as Record<string, number>);
    if (day !== this.day) return;
    // Merge counts that arrived while loading.
    for (const [k, v] of Object.entries(saved)) {
      this.values[k] = k === 'peakOnline' ? Math.max(v, this.values[k] ?? 0) : v + (this.values[k] ?? 0);
    }
    this.visitorBase = saved.visitors ?? 0;
  }

  start() {
    this.timer = setInterval(() => void this.flush(), FLUSH_MS);
    this.timer.unref?.();
  }

  /** New day: save yesterday and start from zero. */
  private roll() {
    const today = dayOf(this.now());
    if (today === this.day) return;
    if (this.dirty) {
      const [day, values] = [this.day, { ...this.values }];
      void this.store.saveStats(day, values).catch((e) => console.error('[analytics]', e));
    }
    this.dirty = false;
    this.day = today;
    this.values = {};
    this.visitors = new Set();
    this.visitorBase = 0;
    this.ready = this.load(today);
  }

  count(metric: string, by = 1) {
    this.roll();
    this.values[metric] = (this.values[metric] ?? 0) + by;
    this.dirty = true;
  }

  peak(metric: string, value: number) {
    this.roll();
    if (value > (this.values[metric] ?? 0)) {
      this.values[metric] = value;
      this.dirty = true;
    }
  }

  visit(id: string) {
    this.roll();
    if (this.visitors.has(id)) return;
    this.visitors.add(id);
    this.values.visitors = this.visitorBase + this.visitors.size;
    this.dirty = true;
  }

  /** Today's numbers so far. */
  async today() {
    await this.ready;
    return { day: this.day, values: { ...this.values } };
  }

  async flush() {
    if (!this.dirty) return;
    await this.ready;
    this.dirty = false;
    await this.store.saveStats(this.day, { ...this.values }).catch((e) => {
      this.dirty = true;
      console.error('[analytics]', e);
    });
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }
}
