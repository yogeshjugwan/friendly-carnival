import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { ReportSource } from '@rc/shared';
import { longestBan, type Appeal, type Ban, type BlockInfo, type NewBan, type NewReport, type Report, type SafetyStore } from './store.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_device TEXT NOT NULL,
  target_device TEXT NOT NULL,
  target_ip_hash TEXT,
  reason TEXT NOT NULL,
  source TEXT NOT NULL,
  note TEXT,
  snapshot TEXT,
  ai_score REAL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at BIGINT NOT NULL,
  resolved_at BIGINT,
  resolution TEXT
);
CREATE INDEX IF NOT EXISTS reports_target_idx ON reports (target_device, created_at);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports (status, created_at);

CREATE TABLE IF NOT EXISTS bans (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  ip_hash TEXT,
  reason TEXT NOT NULL,
  source TEXT NOT NULL,
  expires_at BIGINT,
  created_at BIGINT NOT NULL,
  lifted_at BIGINT
);
CREATE INDEX IF NOT EXISTS bans_device_idx ON bans (device_id);
CREATE INDEX IF NOT EXISTS bans_ip_idx ON bans (ip_hash);

CREATE TABLE IF NOT EXISTS blocks (
  blocker TEXT NOT NULL,
  blocked TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (blocker, blocked)
);
CREATE INDEX IF NOT EXISTS blocks_blocked_idx ON blocks (blocked);
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS country TEXT;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS target_user_id TEXT;
ALTER TABLE bans ADD COLUMN IF NOT EXISTS user_id TEXT;
CREATE INDEX IF NOT EXISTS bans_user_idx ON bans (user_id);

CREATE TABLE IF NOT EXISTS appeals (
  id TEXT PRIMARY KEY,
  ban_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at BIGINT NOT NULL,
  resolved_at BIGINT
);
`;

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

const toReport = (r: Record<string, unknown>): Report => ({
  id: r.id as string,
  reporterDevice: r.reporter_device as string,
  targetDevice: r.target_device as string,
  targetIpHash: (r.target_ip_hash as string | null) ?? null,
  targetUserId: (r.target_user_id as string | null) ?? null,
  reason: r.reason as Report['reason'],
  source: r.source as Report['source'],
  note: (r.note as string | null) ?? null,
  snapshot: (r.snapshot as string | null) ?? null,
  aiScore: num(r.ai_score),
  status: r.status as Report['status'],
  createdAt: Number(r.created_at),
  resolvedAt: num(r.resolved_at),
  resolution: (r.resolution as string | null) ?? null,
});

const toBan = (r: Record<string, unknown>): Ban => ({
  id: r.id as string,
  deviceId: r.device_id as string,
  ipHash: (r.ip_hash as string | null) ?? null,
  userId: (r.user_id as string | null) ?? null,
  reason: r.reason as string,
  source: r.source as Ban['source'],
  expiresAt: num(r.expires_at),
  createdAt: Number(r.created_at),
  liftedAt: num(r.lifted_at),
});

const toAppeal = (r: Record<string, unknown>): Appeal => ({
  id: r.id as string,
  banId: r.ban_id as string,
  deviceId: r.device_id as string,
  message: r.message as string,
  status: r.status as Appeal['status'],
  createdAt: Number(r.created_at),
  resolvedAt: num(r.resolved_at),
});

export class PostgresStore implements SafetyStore {
  constructor(private readonly pool: Pool) {}

  async init() {
    await this.pool.query(SCHEMA);
  }

  async addReport(input: NewReport): Promise<Report> {
    const { rows } = await this.pool.query(
      `INSERT INTO reports (id, reporter_device, target_device, target_ip_hash, reason, source, note, snapshot, ai_score, created_at, target_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        randomUUID(),
        input.reporterDevice,
        input.targetDevice,
        input.targetIpHash,
        input.reason,
        input.source,
        input.note,
        input.snapshot,
        input.aiScore,
        Date.now(),
        input.targetUserId,
      ],
    );
    return toReport(rows[0]);
  }

  async listReports(status?: Report['status'], limit = 200) {
    const { rows } = status
      ? await this.pool.query('SELECT * FROM reports WHERE status = $1 ORDER BY created_at ASC LIMIT $2', [status, limit])
      : await this.pool.query('SELECT * FROM reports ORDER BY created_at DESC LIMIT $1', [limit]);
    return rows.map(toReport);
  }

  async resolveReport(id: string, status: 'actioned' | 'dismissed', resolution: string) {
    const { rows } = await this.pool.query(
      'UPDATE reports SET status = $2, resolution = $3, resolved_at = $4 WHERE id = $1 RETURNING *',
      [id, status, resolution, Date.now()],
    );
    return rows[0] ? toReport(rows[0]) : null;
  }

  async resolveOpenReportsFor(targetDevice: string, resolution: string) {
    const res = await this.pool.query(
      `UPDATE reports SET status = 'actioned', resolution = $2, resolved_at = $3 WHERE target_device = $1 AND status = 'open'`,
      [targetDevice, resolution, Date.now()],
    );
    return res.rowCount ?? 0;
  }

  async distinctReporters(targetDevice: string, since: number, source?: ReportSource) {
    const { rows } = source
      ? await this.pool.query(
          'SELECT COUNT(DISTINCT reporter_device) AS n FROM reports WHERE target_device = $1 AND created_at >= $2 AND source = $3',
          [targetDevice, since, source],
        )
      : await this.pool.query(
          'SELECT COUNT(DISTINCT reporter_device) AS n FROM reports WHERE target_device = $1 AND created_at >= $2',
          [targetDevice, since],
        );
    return Number(rows[0]?.n ?? 0);
  }

  async oldestOpenReportAt() {
    const { rows } = await this.pool.query(`SELECT MIN(created_at) AS t FROM reports WHERE status = 'open'`);
    return num(rows[0]?.t);
  }

  async addBan(input: NewBan): Promise<Ban> {
    const { rows } = await this.pool.query(
      `INSERT INTO bans (id, device_id, ip_hash, reason, source, expires_at, created_at, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [randomUUID(), input.deviceId, input.ipHash, input.reason, input.source, input.expiresAt, Date.now(), input.userId],
    );
    return toBan(rows[0]);
  }

  async activeBan(deviceId: string, ipHash: string | null, userId: string | null = null, now = Date.now()) {
    const { rows } = await this.pool.query(
      `SELECT * FROM bans
       WHERE lifted_at IS NULL AND (expires_at IS NULL OR expires_at > $3)
         AND (device_id = $1 OR ($2::text IS NOT NULL AND ip_hash = $2) OR ($4::text IS NOT NULL AND user_id = $4))`,
      [deviceId, ipHash, now, userId],
    );
    return longestBan(rows.map(toBan));
  }

  async listBans(activeOnly: boolean, now = Date.now()) {
    const { rows } = activeOnly
      ? await this.pool.query(
          'SELECT * FROM bans WHERE lifted_at IS NULL AND (expires_at IS NULL OR expires_at > $1) ORDER BY created_at DESC LIMIT 500',
          [now],
        )
      : await this.pool.query('SELECT * FROM bans ORDER BY created_at DESC LIMIT 500');
    return rows.map(toBan);
  }

  async liftBan(id: string) {
    const { rows } = await this.pool.query('UPDATE bans SET lifted_at = $2 WHERE id = $1 RETURNING *', [id, Date.now()]);
    return rows[0] ? toBan(rows[0]) : null;
  }

  async addBlock(blocker: string, blocked: string, info: BlockInfo = { gender: null, country: null }) {
    await this.pool.query(
      'INSERT INTO blocks (blocker, blocked, created_at, gender, country) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
      [blocker, blocked, Date.now(), info.gender, info.country],
    );
  }

  async listBlocks(blocker: string) {
    const { rows } = await this.pool.query(
      'SELECT blocked, gender, country, created_at FROM blocks WHERE blocker = $1 ORDER BY created_at DESC',
      [blocker],
    );
    return rows.map((r) => ({ blocked: r.blocked as string, gender: r.gender ?? null, country: r.country ?? null, createdAt: Number(r.created_at) }));
  }

  async removeBlock(blocker: string, blocked: string) {
    const { rowCount } = await this.pool.query('DELETE FROM blocks WHERE blocker = $1 AND blocked = $2', [blocker, blocked]);
    return (rowCount ?? 0) > 0;
  }

  async blocksFor(deviceId: string) {
    const { rows } = await this.pool.query(
      'SELECT blocked AS other FROM blocks WHERE blocker = $1 UNION SELECT blocker AS other FROM blocks WHERE blocked = $1',
      [deviceId],
    );
    return new Set(rows.map((r) => r.other as string));
  }

  async addAppeal(banId: string, deviceId: string, message: string) {
    const { rows } = await this.pool.query(
      'INSERT INTO appeals (id, ban_id, device_id, message, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [randomUUID(), banId, deviceId, message, Date.now()],
    );
    return toAppeal(rows[0]);
  }

  async listAppeals(status?: Appeal['status']) {
    const { rows } = status
      ? await this.pool.query('SELECT * FROM appeals WHERE status = $1 ORDER BY created_at ASC LIMIT 500', [status])
      : await this.pool.query('SELECT * FROM appeals ORDER BY created_at DESC LIMIT 500');
    return rows.map(toAppeal);
  }

  async resolveAppeal(id: string, status: 'approved' | 'rejected') {
    const { rows } = await this.pool.query(
      'UPDATE appeals SET status = $2, resolved_at = $3 WHERE id = $1 RETURNING *',
      [id, status, Date.now()],
    );
    return rows[0] ? toAppeal(rows[0]) : null;
  }

  async hasOpenAppeal(banId: string) {
    const { rows } = await this.pool.query(`SELECT 1 FROM appeals WHERE ban_id = $1 AND status = 'open' LIMIT 1`, [banId]);
    return rows.length > 0;
  }

  async purgeSnapshots(olderThan: number) {
    const res = await this.pool.query('UPDATE reports SET snapshot = NULL WHERE snapshot IS NOT NULL AND created_at < $1', [olderThan]);
    return res.rowCount ?? 0;
  }
}
