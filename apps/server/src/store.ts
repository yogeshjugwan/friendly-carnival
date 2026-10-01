import { randomUUID } from 'node:crypto';
import type { ReportReason, ReportSource } from '@rc/shared';

export interface Report {
  id: string;
  reporterDevice: string;
  targetDevice: string;
  targetIpHash: string | null;
  reason: ReportReason;
  source: ReportSource;
  note: string | null;
  /** JPEG data URL of the reported partner's video, when available. */
  snapshot: string | null;
  aiScore: number | null;
  status: 'open' | 'actioned' | 'dismissed';
  createdAt: number;
  resolvedAt: number | null;
  resolution: string | null;
}

export interface Ban {
  id: string;
  deviceId: string;
  ipHash: string | null;
  reason: string;
  source: 'auto' | 'admin';
  /** null = permanent. */
  expiresAt: number | null;
  createdAt: number;
  liftedAt: number | null;
}

export interface Appeal {
  id: string;
  banId: string;
  deviceId: string;
  message: string;
  status: 'open' | 'approved' | 'rejected';
  createdAt: number;
  resolvedAt: number | null;
}

export type NewReport = Omit<Report, 'id' | 'status' | 'createdAt' | 'resolvedAt' | 'resolution'>;
export type NewBan = Omit<Ban, 'id' | 'createdAt' | 'liftedAt'>;

/**
 * Persistence for safety data. MemoryStore is used for tests and when no
 * DATABASE_URL is set; PostgresStore in production.
 */
export interface SafetyStore {
  init(): Promise<void>;

  addReport(report: NewReport): Promise<Report>;
  listReports(status?: Report['status'], limit?: number): Promise<Report[]>;
  resolveReport(id: string, status: 'actioned' | 'dismissed', resolution: string): Promise<Report | null>;
  /** Resolve every open report against a device (used when it gets banned). */
  resolveOpenReportsFor(targetDevice: string, resolution: string): Promise<number>;
  /** Number of distinct reporters against a device since a time, optionally for one source. */
  distinctReporters(targetDevice: string, since: number, source?: ReportSource): Promise<number>;
  oldestOpenReportAt(): Promise<number | null>;

  addBan(ban: NewBan): Promise<Ban>;
  /** The longest-lasting active ban for a device or IP hash, if any. */
  activeBan(deviceId: string, ipHash: string | null, now?: number): Promise<Ban | null>;
  listBans(activeOnly: boolean, now?: number): Promise<Ban[]>;
  liftBan(id: string): Promise<Ban | null>;

  addBlock(blocker: string, blocked: string): Promise<void>;
  /** Devices this device blocked, plus devices that blocked it. */
  blocksFor(deviceId: string): Promise<Set<string>>;

  addAppeal(banId: string, deviceId: string, message: string): Promise<Appeal>;
  listAppeals(status?: Appeal['status']): Promise<Appeal[]>;
  resolveAppeal(id: string, status: 'approved' | 'rejected'): Promise<Appeal | null>;
  hasOpenAppeal(banId: string): Promise<boolean>;

  /** Drop report snapshots older than the retention window. */
  purgeSnapshots(olderThan: number): Promise<number>;
}

const isActive = (b: Ban, now: number) => !b.liftedAt && (b.expiresAt === null || b.expiresAt > now);

/** Longer bans win; permanent beats everything. */
export const longestBan = (bans: Ban[]): Ban | null =>
  bans.reduce<Ban | null>((best, b) => {
    if (!best) return b;
    if (best.expiresAt === null) return best;
    if (b.expiresAt === null || b.expiresAt > best.expiresAt) return b;
    return best;
  }, null);

export class MemoryStore implements SafetyStore {
  private reports = new Map<string, Report>();
  private bans = new Map<string, Ban>();
  private appeals = new Map<string, Appeal>();
  private blocks = new Map<string, Set<string>>();

  async init() {}

  async addReport(input: NewReport): Promise<Report> {
    const report: Report = { ...input, id: randomUUID(), status: 'open', createdAt: Date.now(), resolvedAt: null, resolution: null };
    this.reports.set(report.id, report);
    return report;
  }

  async listReports(status?: Report['status'], limit = 200): Promise<Report[]> {
    return [...this.reports.values()]
      .filter((r) => !status || r.status === status)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, limit);
  }

  async resolveReport(id: string, status: 'actioned' | 'dismissed', resolution: string) {
    const r = this.reports.get(id);
    if (!r) return null;
    Object.assign(r, { status, resolution, resolvedAt: Date.now() });
    return r;
  }

  async resolveOpenReportsFor(targetDevice: string, resolution: string) {
    let n = 0;
    for (const r of this.reports.values()) {
      if (r.targetDevice === targetDevice && r.status === 'open') {
        Object.assign(r, { status: 'actioned', resolution, resolvedAt: Date.now() });
        n++;
      }
    }
    return n;
  }

  async distinctReporters(targetDevice: string, since: number, source?: ReportSource) {
    const who = new Set<string>();
    for (const r of this.reports.values()) {
      if (r.targetDevice === targetDevice && r.createdAt >= since && (!source || r.source === source)) who.add(r.reporterDevice);
    }
    return who.size;
  }

  async oldestOpenReportAt() {
    const open = await this.listReports('open', 1);
    return open[0]?.createdAt ?? null;
  }

  async addBan(input: NewBan): Promise<Ban> {
    const ban: Ban = { ...input, id: randomUUID(), createdAt: Date.now(), liftedAt: null };
    this.bans.set(ban.id, ban);
    return ban;
  }

  async activeBan(deviceId: string, ipHash: string | null, now = Date.now()) {
    return longestBan(
      [...this.bans.values()].filter(
        (b) => isActive(b, now) && (b.deviceId === deviceId || (ipHash !== null && b.ipHash === ipHash)),
      ),
    );
  }

  async listBans(activeOnly: boolean, now = Date.now()) {
    return [...this.bans.values()].filter((b) => !activeOnly || isActive(b, now)).sort((a, b) => b.createdAt - a.createdAt);
  }

  async liftBan(id: string) {
    const b = this.bans.get(id);
    if (!b) return null;
    b.liftedAt = Date.now();
    return b;
  }

  async addBlock(blocker: string, blocked: string) {
    if (!this.blocks.has(blocker)) this.blocks.set(blocker, new Set());
    this.blocks.get(blocker)!.add(blocked);
  }

  async blocksFor(deviceId: string) {
    const out = new Set(this.blocks.get(deviceId) ?? []);
    for (const [blocker, set] of this.blocks) if (set.has(deviceId)) out.add(blocker);
    return out;
  }

  async addAppeal(banId: string, deviceId: string, message: string): Promise<Appeal> {
    const appeal: Appeal = { id: randomUUID(), banId, deviceId, message, status: 'open', createdAt: Date.now(), resolvedAt: null };
    this.appeals.set(appeal.id, appeal);
    return appeal;
  }

  async listAppeals(status?: Appeal['status']) {
    return [...this.appeals.values()].filter((a) => !status || a.status === status).sort((a, b) => a.createdAt - b.createdAt);
  }

  async resolveAppeal(id: string, status: 'approved' | 'rejected') {
    const a = this.appeals.get(id);
    if (!a) return null;
    Object.assign(a, { status, resolvedAt: Date.now() });
    return a;
  }

  async hasOpenAppeal(banId: string) {
    return [...this.appeals.values()].some((a) => a.banId === banId && a.status === 'open');
  }

  async purgeSnapshots(olderThan: number) {
    let n = 0;
    for (const r of this.reports.values()) {
      if (r.snapshot && r.createdAt < olderThan) {
        r.snapshot = null;
        n++;
      }
    }
    return n;
  }
}
