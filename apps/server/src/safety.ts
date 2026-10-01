import { createHash } from 'node:crypto';
import {
  MAX_REPORT_NOTE_LENGTH,
  MAX_SNAPSHOT_BYTES,
  REPORT_REASONS,
  type BanInfo,
  type ReportPayload,
  type ReportReason,
} from '@rc/shared';
import type { Ban, Report, SafetyStore } from './store.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Automatic actions. Each rule counts DISTINCT reporters, so one angry user
 * cannot ban someone alone; admins review everything afterwards.
 */
export const AUTO_RULES = {
  /** 3 different people report someone within 24 h → 24 h ban. */
  user: { reporters: 3, windowMs: DAY, banMs: DAY },
  /** 2 different people report "underage" within 24 h → 7 day ban pending review. */
  underage: { reporters: 2, windowMs: DAY, banMs: 7 * DAY },
  /** AI flags nudity from 2 different partners within 1 h → 1 h ban. */
  ai: { reporters: 2, windowMs: HOUR, banMs: HOUR },
} as const;

export const SNAPSHOT_RETENTION_MS = 30 * DAY;

export interface Party {
  deviceId: string;
  ipHash: string | null;
  /** Logged-in account, if any. */
  userId?: string | null;
}

export function hashIp(ip: string | null | undefined, salt: string): string | null {
  if (!ip) return null;
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

/** Client IP behind Render/Vercel/Cloudflare proxies, else the socket address. */
export function clientIp(headers: Record<string, string | string[] | undefined>, address: string | undefined): string | null {
  const pick = (h: string | string[] | undefined) => (Array.isArray(h) ? h[0] : h);
  const forwarded = pick(headers['cf-connecting-ip']) ?? pick(headers['x-forwarded-for'])?.split(',')[0];
  return forwarded?.trim() || address || null;
}

const DEVICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isDeviceId = (v: unknown): v is string => typeof v === 'string' && DEVICE_ID.test(v);

export function parseReport(input: unknown): ReportPayload | null {
  if (!input || typeof input !== 'object') return null;
  const r = input as Record<string, unknown>;
  if (r.target !== 'current' && r.target !== 'previous') return null;
  if (!REPORT_REASONS.includes(r.reason as ReportReason)) return null;
  if (r.source !== 'user' && r.source !== 'ai') return null;
  const snapshot =
    typeof r.snapshot === 'string' && r.snapshot.startsWith('data:image/jpeg;base64,') && r.snapshot.length <= MAX_SNAPSHOT_BYTES
      ? r.snapshot
      : undefined;
  const note = typeof r.note === 'string' ? r.note.trim().slice(0, MAX_REPORT_NOTE_LENGTH) || undefined : undefined;
  const aiScore = typeof r.aiScore === 'number' && r.aiScore >= 0 && r.aiScore <= 1 ? r.aiScore : undefined;
  return { target: r.target, reason: r.reason as ReportReason, source: r.source, note, snapshot, aiScore };
}

export const banInfo = (ban: Ban, appealPending: boolean): BanInfo => ({
  banId: ban.id,
  reason: ban.reason,
  expiresAt: ban.expiresAt,
  appealPending,
});

export class Safety {
  constructor(
    private readonly store: SafetyStore,
    /** Called whenever a ban is created so live sessions can be kicked. */
    private readonly onBan: (ban: Ban) => void = () => {},
  ) {}

  async checkBan(party: Party): Promise<BanInfo | null> {
    const ban = await this.store.activeBan(party.deviceId, party.ipHash, party.userId ?? null);
    return ban ? banInfo(ban, await this.store.hasOpenAppeal(ban.id)) : null;
  }

  /**
   * Bans a device. The IP is included only when asked: mobile carriers put many
   * users behind one IP (CGNAT), so automatic bans never use it.
   */
  async ban(
    target: Party,
    durationMs: number | null,
    reason: string,
    source: Ban['source'],
    { includeIp = false }: { includeIp?: boolean } = {},
  ): Promise<Ban> {
    const ban = await this.store.addBan({
      deviceId: target.deviceId,
      ipHash: includeIp ? target.ipHash : null,
      userId: target.userId ?? null,
      reason,
      source,
      expiresAt: durationMs === null ? null : Date.now() + durationMs,
    });
    await this.store.resolveOpenReportsFor(target.deviceId, `banned (${source})`);
    this.onBan(ban);
    return ban;
  }

  /** Stores the report, then applies the automatic rules. Returns the auto ban, if one was issued. */
  async report(reporter: Party, target: Party, payload: ReportPayload): Promise<{ report: Report; ban: Ban | null }> {
    const report = await this.store.addReport({
      reporterDevice: reporter.deviceId,
      targetDevice: target.deviceId,
      targetIpHash: target.ipHash,
      targetUserId: target.userId ?? null,
      reason: payload.reason,
      source: payload.source,
      note: payload.note ?? null,
      snapshot: payload.snapshot ?? null,
      aiScore: payload.aiScore ?? null,
    });

    const now = Date.now();
    const already = await this.store.activeBan(target.deviceId, target.ipHash, target.userId ?? null);
    if (already) return { report, ban: null };

    if (payload.source === 'ai') {
      const n = await this.store.distinctReporters(target.deviceId, now - AUTO_RULES.ai.windowMs, 'ai');
      if (n >= AUTO_RULES.ai.reporters) {
        return { report, ban: await this.ban(target, AUTO_RULES.ai.banMs, 'Automatic: nudity detected', 'auto') };
      }
      return { report, ban: null };
    }

    if (payload.reason === 'underage') {
      const n = await this.countReason(target.deviceId, 'underage', now - AUTO_RULES.underage.windowMs);
      if (n >= AUTO_RULES.underage.reporters) {
        return {
          report,
          ban: await this.ban(target, AUTO_RULES.underage.banMs, 'Automatic: reported as under 18, pending review', 'auto'),
        };
      }
    }

    const n = await this.store.distinctReporters(target.deviceId, now - AUTO_RULES.user.windowMs, 'user');
    if (n >= AUTO_RULES.user.reporters) {
      return { report, ban: await this.ban(target, AUTO_RULES.user.banMs, 'Automatic: reported by several users', 'auto') };
    }
    return { report, ban: null };
  }

  private async countReason(targetDevice: string, reason: ReportReason, since: number): Promise<number> {
    const open = await this.store.listReports(undefined, 1_000);
    return new Set(
      open.filter((r) => r.targetDevice === targetDevice && r.reason === reason && r.createdAt >= since).map((r) => r.reporterDevice),
    ).size;
  }
}
