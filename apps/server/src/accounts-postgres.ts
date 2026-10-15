import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { PushSubscriptionJSON, UserSettings, VerifyGestureId } from '@rc/shared';
import {
  DEFAULT_SETTINGS,
  NO_PLUS,
  TOKEN_TTL,
  isPlusActive,
  normalizeEmail,
  newToken,
  hashToken,
  newRefCode,
  type AccountStore,
  type AccountStats,
  type HistoryRow,
  type StoredMessage,
  type StoredPlus,
  type User,
  type TokenKind,
  type PaymentRecord,
  type PaymentCredit,
} from './accounts-types.ts';

const ACCOUNT_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  settings TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_tokens_user_idx ON auth_tokens (user_id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plus TEXT;
CREATE INDEX IF NOT EXISTS users_stripe_customer_idx ON users (stripe_customer_id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS boost_until BIGINT;
CREATE TABLE IF NOT EXISTS coin_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT UNIQUE,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS coin_ledger_user_idx ON coin_ledger (user_id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_status TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ref_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_last_day TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_used BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_opt_out BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_winback_at BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_review BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_rewarded BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS users_ref_code_idx ON users (ref_code);
CREATE INDEX IF NOT EXISTS users_referred_by_idx ON users (referred_by);
CREATE TABLE IF NOT EXISTS verifications (
  user_id TEXT PRIMARY KEY,
  gesture TEXT NOT NULL,
  photo TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS friend_messages (
  id TEXT PRIMARY KEY,
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  read_at BIGINT
);
CREATE INDEX IF NOT EXISTS friend_messages_pair_idx ON friend_messages (from_user, to_user, created_at);
CREATE INDEX IF NOT EXISTS friend_messages_unread_idx ON friend_messages (to_user, read_at);
CREATE TABLE IF NOT EXISTS payments (
  ref TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS match_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  partner_key TEXT NOT NULL,
  partner_user_id TEXT,
  name TEXT NOT NULL,
  avatar TEXT,
  gender TEXT,
  country TEXT,
  mode TEXT NOT NULL,
  at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS match_history_user_idx ON match_history (user_id, at);
CREATE TABLE IF NOT EXISTS follows (
  follower TEXT NOT NULL,
  followee TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (follower, followee)
);
CREATE INDEX IF NOT EXISTS follows_followee_idx ON follows (followee);
CREATE TABLE IF NOT EXISTS app_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id);
CREATE TABLE IF NOT EXISTS friends (
  user_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  nickname TEXT,
  gender TEXT,
  country TEXT,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);
`;

const toUser = (r: Record<string, unknown>): User => ({
  id: r.id as string,
  email: r.email as string,
  passwordHash: r.password_hash as string,
  emailVerified: !!r.email_verified,
  createdAt: Number(r.created_at),
  settings: { ...DEFAULT_SETTINGS, ...(JSON.parse((r.settings as string) || '{}') as Partial<UserSettings>) },
  stripeCustomerId: (r.stripe_customer_id as string | null) ?? null,
  plus: { ...NO_PLUS, ...(JSON.parse((r.plus as string) || '{}') as Partial<StoredPlus>) },
  coins: Number(r.coins ?? 0),
  boostUntil: r.boost_until == null ? null : Number(r.boost_until),
  verifiedAt: r.verified_at == null ? null : Number(r.verified_at),
  verifyStatus: r.verify_status === 'pending' || r.verify_status === 'rejected' ? r.verify_status : null,
  referredBy: (r.referred_by as string | null) ?? null,
  referralRewarded: !!r.referral_rewarded,
  streakDays: Number(r.streak_days ?? 0),
  streakLastDay: (r.streak_last_day as string | null) ?? null,
  trialUsed: !!r.trial_used,
  birthDate: (r.birth_date as string | null) ?? null,
  ageReview: !!r.age_review,
  lastSeenAt: r.last_seen_at == null ? null : Number(r.last_seen_at),
  emailOptOut: !!r.email_opt_out,
  lastWinbackAt: r.last_winback_at == null ? null : Number(r.last_winback_at),
});

type Queryable = Pick<Pool, 'query'>;
class NotEnough extends Error {}

export class PostgresAccountStore implements AccountStore {
  constructor(private readonly pool: Pool) {}

  async init() {
    await this.pool.query(ACCOUNT_SCHEMA);
  }

  async createUser(email: string, passwordHash: string) {
    try {
      const { rows } = await this.pool.query(
        'INSERT INTO users (id, email, password_hash, settings, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [randomUUID(), normalizeEmail(email), passwordHash, JSON.stringify(DEFAULT_SETTINGS), Date.now()],
      );
      return toUser(rows[0]);
    } catch (e) {
      // 23505 = unique_violation (the email is taken).
      const err = e as { code?: string; message?: string };
      if (err.code === '23505' || /duplicate|unique/i.test(err.message ?? '')) return 'exists' as const;
      throw e;
    }
  }

  async userById(id: string) {
    const { rows } = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async userByEmail(email: string) {
    const { rows } = await this.pool.query('SELECT * FROM users WHERE email = $1', [normalizeEmail(email)]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async updateSettings(id: string, settings: UserSettings) {
    await this.pool.query('UPDATE users SET settings = $2 WHERE id = $1', [id, JSON.stringify(settings)]);
  }

  async setPassword(id: string, passwordHash: string) {
    await this.pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [id, passwordHash]);
  }

  async markVerified(id: string) {
    await this.pool.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [id]);
  }

  async deleteUser(id: string) {
    await this.pool.query('DELETE FROM auth_tokens WHERE user_id = $1', [id]);
    await this.pool.query('DELETE FROM friends WHERE user_id = $1 OR friend_id = $1', [id]);
    await this.pool.query('DELETE FROM coin_ledger WHERE user_id = $1', [id]);
    await this.pool.query('DELETE FROM verifications WHERE user_id = $1', [id]);
    await this.pool.query('DELETE FROM push_subscriptions WHERE user_id = $1', [id]);
    await this.pool.query('DELETE FROM friend_messages WHERE from_user = $1 OR to_user = $1', [id]);
    await this.pool.query('DELETE FROM match_history WHERE user_id = $1 OR partner_user_id = $1', [id]);
    await this.pool.query('DELETE FROM follows WHERE follower = $1 OR followee = $1', [id]);
    await this.pool.query('DELETE FROM users WHERE id = $1', [id]);
  }

  async createToken(userId: string, kind: TokenKind) {
    const raw = newToken();
    const now = Date.now();
    await this.pool.query('INSERT INTO auth_tokens (token_hash, user_id, kind, expires_at, created_at) VALUES ($1,$2,$3,$4,$5)', [
      hashToken(raw),
      userId,
      kind,
      now + TOKEN_TTL[kind],
      now,
    ]);
    return raw;
  }

  async useToken(raw: string, kind: TokenKind) {
    const key = hashToken(raw);
    const { rows } = await this.pool.query('SELECT * FROM auth_tokens WHERE token_hash = $1 AND kind = $2', [key, kind]);
    const row = rows[0];
    if (!row) return null;
    const expired = Number(row.expires_at) <= Date.now();
    if (expired || kind !== 'session') await this.pool.query('DELETE FROM auth_tokens WHERE token_hash = $1', [key]);
    if (expired) return null;
    return this.userById(row.user_id as string);
  }

  async deleteToken(raw: string) {
    await this.pool.query('DELETE FROM auth_tokens WHERE token_hash = $1', [hashToken(raw)]);
  }

  async deleteTokensFor(userId: string, kind?: TokenKind) {
    if (kind) await this.pool.query('DELETE FROM auth_tokens WHERE user_id = $1 AND kind = $2', [userId, kind]);
    else await this.pool.query('DELETE FROM auth_tokens WHERE user_id = $1', [userId]);
  }

  async setStripeCustomer(userId: string, customerId: string) {
    await this.pool.query('UPDATE users SET stripe_customer_id = $2 WHERE id = $1', [userId, customerId]);
  }

  async userByStripeCustomer(customerId: string) {
    const { rows } = await this.pool.query('SELECT * FROM users WHERE stripe_customer_id = $1', [customerId]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async setPlus(userId: string, plus: StoredPlus) {
    await this.pool.query('UPDATE users SET plus = $2 WHERE id = $1', [userId, JSON.stringify(plus)]);
  }

  /** Runs `fn` in one transaction on a dedicated client. */
  private async tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  /** Ledger row + balance change on `q` (inside a transaction). Null if it would go negative. */
  private async coinsOn(q: Queryable, userId: string, delta: number, reason: string, ref: string | null) {
    if (ref) {
      // The unique ref makes a repeated event a no-op.
      const ins = await q.query('INSERT INTO coin_ledger (id, user_id, delta, reason, ref, created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING', [
        randomUUID(),
        userId,
        delta,
        reason,
        ref,
        Date.now(),
      ]);
      if (!ins.rowCount) {
        const { rows } = await q.query('SELECT coins FROM users WHERE id = $1', [userId]);
        return rows[0] ? Number(rows[0].coins) : null;
      }
    }
    // Never goes below zero.
    const { rows } = await q.query('UPDATE users SET coins = coins + $2 WHERE id = $1 AND coins + $2 >= 0 RETURNING coins', [userId, delta]);
    if (!rows[0]) throw new NotEnough();
    if (!ref) {
      await q.query('INSERT INTO coin_ledger (id, user_id, delta, reason, ref, created_at) VALUES ($1,$2,$3,$4,NULL,$5)', [randomUUID(), userId, delta, reason, Date.now()]);
    }
    return Number(rows[0].coins);
  }

  async changeCoins(userId: string, delta: number, reason: string, ref?: string) {
    try {
      return await this.tx((q) => this.coinsOn(q, userId, delta, reason, ref ?? null));
    } catch (e) {
      if (e instanceof NotEnough) return null;
      throw e;
    }
  }

  async applyPayment(p: PaymentRecord, credit: PaymentCredit) {
    return this.tx(async (q) => {
      const ins = await q.query('INSERT INTO payments (ref, user_id, product, amount, created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [
        p.ref,
        p.userId,
        p.product,
        p.amount,
        Date.now(),
      ]);
      if (!ins.rowCount) return false;
      if ('coins' in credit) await this.coinsOn(q, p.userId, credit.coins, 'purchase', p.ref);
      else await q.query('UPDATE users SET plus = $2 WHERE id = $1', [p.userId, JSON.stringify(credit.plus)]);
      return true;
    });
  }

  async transferCoins(from: string, to: string | null, amount: number, earned: number, reason: string, receivedReason: string) {
    try {
      return await this.tx(async (q) => {
        const balance = await this.coinsOn(q, from, -amount, reason, null);
        if (to && earned > 0) await this.coinsOn(q, to, earned, receivedReason, null);
        return balance;
      });
    } catch (e) {
      if (e instanceof NotEnough) return null;
      throw e;
    }
  }

  async setBoost(userId: string, until: number | null) {
    await this.pool.query('UPDATE users SET boost_until = $2 WHERE id = $1', [userId, until]);
  }

  async submitVerification(userId: string, gesture: VerifyGestureId, photo: string) {
    await this.pool.query('DELETE FROM verifications WHERE user_id = $1', [userId]);
    await this.pool.query('INSERT INTO verifications (user_id, gesture, photo, created_at) VALUES ($1,$2,$3,$4)', [userId, gesture, photo, Date.now()]);
    await this.pool.query("UPDATE users SET verify_status = 'pending' WHERE id = $1", [userId]);
  }

  async listPendingVerifications() {
    const { rows } = await this.pool.query(
      'SELECT v.user_id, v.gesture, v.photo, v.created_at, u.email FROM verifications v JOIN users u ON u.id = v.user_id ORDER BY v.created_at LIMIT 100',
    );
    return rows.map((r) => ({
      userId: r.user_id as string,
      email: r.email as string,
      gesture: r.gesture as VerifyGestureId,
      photo: r.photo as string,
      createdAt: Number(r.created_at),
    }));
  }

  async resolveVerification(userId: string, approve: boolean) {
    const { rowCount } = await this.pool.query('DELETE FROM verifications WHERE user_id = $1', [userId]);
    if (!rowCount) return false;
    if (approve) await this.pool.query('UPDATE users SET verified_at = $2, verify_status = NULL WHERE id = $1', [userId, Date.now()]);
    else await this.pool.query("UPDATE users SET verify_status = 'rejected' WHERE id = $1", [userId]);
    return true;
  }

  async revokeVerification(userId: string) {
    await this.pool.query('UPDATE users SET verified_at = NULL WHERE id = $1', [userId]);
  }

  async referralCode(userId: string) {
    const { rows } = await this.pool.query('SELECT ref_code FROM users WHERE id = $1', [userId]);
    if (rows[0]?.ref_code) return rows[0].ref_code as string;
    for (let tries = 0; ; tries++) {
      const code = newRefCode();
      try {
        await this.pool.query('UPDATE users SET ref_code = $2 WHERE id = $1 AND ref_code IS NULL', [userId, code]);
      } catch (e) {
        // A code clash (23505): try another one.
        if (tries < 5 && (e as { code?: string; message?: string }).code === '23505') continue;
        if (tries < 5 && /duplicate|unique/i.test(String((e as Error).message))) continue;
        throw e;
      }
      const again = await this.pool.query('SELECT ref_code FROM users WHERE id = $1', [userId]);
      return again.rows[0].ref_code as string;
    }
  }

  async userByReferralCode(code: string) {
    const { rows } = await this.pool.query('SELECT * FROM users WHERE ref_code = $1', [code.toLowerCase()]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async setReferredBy(userId: string, referrerId: string) {
    const { rowCount } = await this.pool.query('UPDATE users SET referred_by = $2 WHERE id = $1 AND referred_by IS NULL', [userId, referrerId]);
    return !!rowCount;
  }

  async markReferralRewarded(userId: string) {
    const { rowCount } = await this.pool.query(
      'UPDATE users SET referral_rewarded = TRUE WHERE id = $1 AND referral_rewarded = FALSE',
      [userId],
    );
    return !!rowCount;
  }

  async touchLastSeen(userId: string, at: number) {
    await this.pool.query('UPDATE users SET last_seen_at = $2 WHERE id = $1', [userId, at]);
  }

  async setEmailOptOut(userId: string, optOut: boolean) {
    await this.pool.query('UPDATE users SET email_opt_out = $2 WHERE id = $1', [userId, optOut]);
  }

  async winbackCandidates(awaySince: number, lastSentBefore: number, limit: number) {
    const { rows } = await this.pool.query(
      `SELECT * FROM users WHERE email_verified = TRUE AND email_opt_out = FALSE
         AND COALESCE(last_seen_at, created_at) < $1
         AND (last_winback_at IS NULL OR last_winback_at < $2)
       LIMIT $3`,
      [awaySince, lastSentBefore, limit],
    );
    return rows.map(toUser);
  }

  async markWinbackSent(userId: string, at: number) {
    await this.pool.query('UPDATE users SET last_winback_at = $2 WHERE id = $1', [userId, at]);
  }

  async setBirthDate(userId: string, birthDate: string) {
    const { rowCount } = await this.pool.query('UPDATE users SET birth_date = $2 WHERE id = $1 AND birth_date IS NULL', [userId, birthDate]);
    return !!rowCount;
  }

  async setAgeReview(userId: string, on: boolean) {
    await this.pool.query('UPDATE users SET age_review = $2 WHERE id = $1', [userId, on]);
  }

  async recordPayment(ref: string, userId: string, product: string, amount: number) {
    try {
      await this.pool.query('INSERT INTO payments (ref, user_id, product, amount, created_at) VALUES ($1,$2,$3,$4,$5)', [ref, userId, product, amount, Date.now()]);
      return true;
    } catch (e) {
      // Already recorded (unique ref); anything else is a real error.
      const err = e as { code?: string; message?: string };
      if (err.code === '23505' || /duplicate|unique/i.test(err.message ?? '')) return false;
      throw e;
    }
  }

  async useTrial(userId: string) {
    const { rowCount } = await this.pool.query('UPDATE users SET trial_used = TRUE WHERE id = $1 AND trial_used = FALSE', [userId]);
    return !!rowCount;
  }

  async setStreak(userId: string, days: number, lastDay: string, previousDay: string | null) {
    // Compare-and-set on the last claimed day, so two taps can't both claim.
    const { rowCount } = await this.pool.query(
      previousDay === null
        ? 'UPDATE users SET streak_days = $2, streak_last_day = $3 WHERE id = $1 AND streak_last_day IS NULL'
        : 'UPDATE users SET streak_days = $2, streak_last_day = $3 WHERE id = $1 AND streak_last_day = $4',
      previousDay === null ? [userId, days, lastDay] : [userId, days, lastDay, previousDay],
    );
    return !!rowCount;
  }

  async appSecret(key: string) {
    const { rows } = await this.pool.query('SELECT value FROM app_secrets WHERE key = $1', [key]);
    return (rows[0]?.value as string | undefined) ?? null;
  }

  async initAppSecret(key: string, value: string) {
    try {
      await this.pool.query('INSERT INTO app_secrets (key, value) VALUES ($1, $2)', [key, value]);
    } catch {
      // Another instance stored one first; use theirs.
    }
    return (await this.appSecret(key))!;
  }

  async addPushSubscription(userId: string, sub: PushSubscriptionJSON) {
    await this.pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
    await this.pool.query('INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES ($1,$2,$3,$4,$5)', [
      sub.endpoint,
      userId,
      sub.keys.p256dh,
      sub.keys.auth,
      Date.now(),
    ]);
  }

  async removePushSubscription(endpoint: string) {
    await this.pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
  }

  async pushSubscriptions(userId: string) {
    const { rows } = await this.pool.query('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1', [userId]);
    return rows.map((r) => ({ endpoint: r.endpoint as string, keys: { p256dh: r.p256dh as string, auth: r.auth as string } }));
  }

  async accountStats(since: number): Promise<AccountStats> {
    const [users, ledger] = await Promise.all([
      this.pool.query('SELECT created_at, plus, verified_at FROM users'),
      this.pool.query("SELECT delta, created_at FROM coin_ledger WHERE reason = 'purchase' AND created_at >= $1", [since]),
    ]);
    const plusOf = (raw: unknown) => ({ ...NO_PLUS, ...(JSON.parse((raw as string) || '{}') as Partial<StoredPlus>) });
    return {
      users: users.rows.length,
      plusActive: users.rows.filter((r) => isPlusActive(plusOf(r.plus))).length,
      verified: users.rows.filter((r) => r.verified_at != null).length,
      signups: users.rows.map((r) => Number(r.created_at)).filter((t) => t >= since),
      purchases: ledger.rows.map((r) => ({ at: Number(r.created_at), coins: Number(r.delta) })),
    };
  }

  async referralCounts(referrerId: string) {
    const { rows } = await this.pool.query('SELECT referral_rewarded FROM users WHERE referred_by = $1', [referrerId]);
    return { invited: rows.length, rewarded: rows.filter((r) => r.referral_rewarded).length };
  }

  async addFriend(userId: string, friendId: string, seen: { gender: string | null; country: string | null }) {
    await this.pool.query(
      'INSERT INTO friends (user_id, friend_id, gender, country, created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
      [userId, friendId, seen.gender, seen.country, Date.now()],
    );
  }

  async listFriends(userId: string) {
    const { rows } = await this.pool.query(
      'SELECT friend_id, nickname, gender, country, created_at FROM friends WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );
    return rows.map((r) => ({
      friendId: r.friend_id as string,
      nickname: (r.nickname as string | null) ?? null,
      gender: (r.gender as string | null) ?? null,
      country: (r.country as string | null) ?? null,
      createdAt: Number(r.created_at),
    }));
  }

  async isFriend(userId: string, friendId: string) {
    const { rowCount } = await this.pool.query('SELECT 1 FROM friends WHERE user_id = $1 AND friend_id = $2', [userId, friendId]);
    return (rowCount ?? 0) > 0;
  }

  async removeFriendship(a: string, b: string) {
    await this.pool.query('DELETE FROM friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)', [a, b]);
    await this.pool.query('DELETE FROM friend_messages WHERE (from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1)', [a, b]);
  }

  async addHistory(e: Omit<HistoryRow, 'id'>) {
    await this.pool.query(
      'INSERT INTO match_history (id, user_id, partner_key, partner_user_id, name, avatar, gender, country, mode, at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [randomUUID(), e.userId, e.partnerKey, e.partnerUserId, e.name, e.avatar, e.gender, e.country, e.mode, e.at],
    );
  }

  async historyOf(userId: string, limit: number) {
    const { rows } = await this.pool.query('SELECT * FROM match_history WHERE user_id = $1 ORDER BY at DESC LIMIT $2', [userId, limit]);
    return rows.map((r) => ({
      id: r.id as string,
      userId: r.user_id as string,
      partnerKey: r.partner_key as string,
      partnerUserId: (r.partner_user_id as string | null) ?? null,
      name: r.name as string,
      avatar: (r.avatar as string | null) ?? null,
      gender: (r.gender as string | null) ?? null,
      country: (r.country as string | null) ?? null,
      mode: r.mode as string,
      at: Number(r.at),
    }));
  }

  async removeHistory(userId: string, partnerKey: string) {
    await this.pool.query('DELETE FROM match_history WHERE user_id = $1 AND partner_key = $2', [userId, partnerKey]);
  }

  async follow(follower: string, followee: string, on: boolean) {
    await this.pool.query('DELETE FROM follows WHERE follower = $1 AND followee = $2', [follower, followee]);
    if (on) await this.pool.query('INSERT INTO follows (follower, followee, created_at) VALUES ($1,$2,$3)', [follower, followee, Date.now()]);
  }

  async following(follower: string) {
    const { rows } = await this.pool.query('SELECT followee FROM follows WHERE follower = $1', [follower]);
    return new Set(rows.map((r) => r.followee as string));
  }

  async followers(followee: string) {
    const { rows } = await this.pool.query('SELECT follower FROM follows WHERE followee = $1', [followee]);
    return rows.map((r) => r.follower as string);
  }

  async threadsOf(userId: string) {
    const { rows } = await this.pool.query(
      'SELECT * FROM friend_messages WHERE from_user = $1 OR to_user = $1 ORDER BY created_at DESC LIMIT 2000',
      [userId],
    );
    const byOther = new Map<string, { other: string; last: StoredMessage; unread: number; mine: number; theirs: number }>();
    for (const r of rows) {
      const m: StoredMessage = {
        id: r.id as string,
        from: r.from_user as string,
        to: r.to_user as string,
        text: r.text as string,
        at: Number(r.created_at),
        readAt: r.read_at == null ? null : Number(r.read_at),
      };
      const other = m.from === userId ? m.to : m.from;
      const t = byOther.get(other) ?? { other, last: m, unread: 0, mine: 0, theirs: 0 };
      if (m.from === userId) t.mine++;
      else {
        t.theirs++;
        if (!m.readAt) t.unread++;
      }
      byOther.set(other, t);
    }
    return [...byOther.values()];
  }

  async addMessage(from: string, to: string, text: string) {
    const m: StoredMessage = { id: randomUUID(), from, to, text, at: Date.now(), readAt: null };
    await this.pool.query('INSERT INTO friend_messages (id, from_user, to_user, text, created_at) VALUES ($1,$2,$3,$4,$5)', [m.id, from, to, text, m.at]);
    return m;
  }

  async messagesBetween(a: string, b: string, limit: number) {
    const { rows } = await this.pool.query(
      `SELECT * FROM friend_messages WHERE (from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1)
       ORDER BY created_at DESC LIMIT $3`,
      [a, b, limit],
    );
    return rows
      .map((r) => ({
        id: r.id as string,
        from: r.from_user as string,
        to: r.to_user as string,
        text: r.text as string,
        at: Number(r.created_at),
        readAt: r.read_at == null ? null : Number(r.read_at),
      }))
      .reverse();
  }

  async markRead(to: string, from: string) {
    await this.pool.query('UPDATE friend_messages SET read_at = $3 WHERE to_user = $1 AND from_user = $2 AND read_at IS NULL', [to, from, Date.now()]);
  }

  async unreadCounts(to: string) {
    const { rows } = await this.pool.query('SELECT from_user FROM friend_messages WHERE to_user = $1 AND read_at IS NULL', [to]);
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.from_user as string, (counts.get(r.from_user as string) ?? 0) + 1);
    return counts;
  }

  async renameFriend(userId: string, friendId: string, nickname: string | null) {
    await this.pool.query('UPDATE friends SET nickname = $3 WHERE user_id = $1 AND friend_id = $2', [userId, friendId, nickname]);
  }
}
