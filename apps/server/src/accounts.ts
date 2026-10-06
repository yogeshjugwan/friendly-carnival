import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Pool } from 'pg';
import { NO_FILTERS, type PendingVerification, type PlusPlan, type PlusStatus, type UserSettings, type VerifyGestureId } from '@rc/shared';

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

export type TokenKind = 'session' | 'verify' | 'reset';

export const TOKEN_TTL: Record<TokenKind, number> = {
  session: 30 * 24 * 3_600_000,
  verify: 48 * 3_600_000,
  reset: 3_600_000,
};

export const DEFAULT_SETTINGS: UserSettings = {
  gender: null,
  interests: [],
  allowReconnect: true,
  hideCountry: false,
  filters: { ...NO_FILTERS },
};

/** Subscription state as stored (Stripe ids stay server-side). */
export interface StoredPlus {
  status: string | null;
  plan: PlusPlan | null;
  until: number | null;
  cancelAtPeriodEnd: boolean;
  subscriptionId: string | null;
}

export const NO_PLUS: StoredPlus = { status: null, plan: null, until: null, cancelAtPeriodEnd: false, subscriptionId: null };

/** Statuses that keep Plus on until the paid period ends ('past_due' = Stripe retrying a failed payment). */
const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due', 'admin']);

export const isPlusActive = (plus: StoredPlus, now = Date.now()) =>
  !!plus.status && ACTIVE_STATUSES.has(plus.status) && plus.until !== null && plus.until > now;

export const publicPlus = (plus: StoredPlus): PlusStatus => ({
  active: isPlusActive(plus),
  plan: plus.plan,
  until: plus.until,
  status: plus.status,
  cancelAtPeriodEnd: plus.cancelAtPeriodEnd,
});

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  emailVerified: boolean;
  createdAt: number;
  settings: UserSettings;
  stripeCustomerId: string | null;
  plus: StoredPlus;
  /** Coin balance. */
  coins: number;
  /** Boost is on until this time (ms), else null. */
  boostUntil: number | null;
  /** ✓ Verified since (ms), else null. */
  verifiedAt: number | null;
  /** A selfie is waiting for review, or the last one was rejected. */
  verifyStatus: 'pending' | 'rejected' | null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, SCRYPT);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Tokens are random; only their SHA-256 is stored, so a database leak exposes no usable tokens. */
const newToken = () => randomBytes(32).toString('base64url');
const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export interface AccountStore {
  init(): Promise<void>;
  createUser(email: string, passwordHash: string): Promise<User | 'exists'>;
  userById(id: string): Promise<User | null>;
  userByEmail(email: string): Promise<User | null>;
  updateSettings(id: string, settings: UserSettings): Promise<void>;
  setPassword(id: string, passwordHash: string): Promise<void>;
  markVerified(id: string): Promise<void>;
  deleteUser(id: string): Promise<void>;
  /** Creates a token and returns the raw value (only ever shown once). */
  createToken(userId: string, kind: TokenKind): Promise<string>;
  /** User for a valid, unexpired token. One-time kinds (verify, reset) are consumed. */
  useToken(raw: string, kind: TokenKind): Promise<User | null>;
  deleteToken(raw: string): Promise<void>;
  deleteTokensFor(userId: string, kind?: TokenKind): Promise<void>;
  setStripeCustomer(userId: string, customerId: string): Promise<void>;
  userByStripeCustomer(customerId: string): Promise<User | null>;
  setPlus(userId: string, plus: StoredPlus): Promise<void>;

  /**
   * Adds (or with a negative delta, spends) coins. Returns the new balance, or
   * null when there aren't enough coins. With `ref` (e.g. a Stripe checkout id)
   * the change happens at most once.
   */
  changeCoins(userId: string, delta: number, reason: string, ref?: string): Promise<number | null>;
  setBoost(userId: string, until: number | null): Promise<void>;
  /** Stores a verification selfie (replacing any earlier one) and marks the user pending. */
  submitVerification(userId: string, gesture: VerifyGestureId, photo: string): Promise<void>;
  listPendingVerifications(): Promise<PendingVerification[]>;
  /** Approves or rejects a pending selfie and deletes the photo. False when none was pending. */
  resolveVerification(userId: string, approve: boolean): Promise<boolean>;
  /** Removes the badge (e.g. after abuse reports). */
  revokeVerification(userId: string): Promise<void>;
  /** One direction of a friendship: what `userId` saw of `friendId`, plus their nickname for them. */
  addFriend(userId: string, friendId: string, seen: { gender: string | null; country: string | null }): Promise<void>;
  listFriends(userId: string): Promise<StoredFriend[]>;
  isFriend(userId: string, friendId: string): Promise<boolean>;
  /** Removes both directions. */
  removeFriendship(a: string, b: string): Promise<void>;
  renameFriend(userId: string, friendId: string, nickname: string | null): Promise<void>;
}

export interface StoredFriend {
  friendId: string;
  nickname: string | null;
  gender: string | null;
  country: string | null;
  createdAt: number;
}

export const MAX_FRIENDS = 200;

interface TokenRow {
  userId: string;
  kind: TokenKind;
  expiresAt: number;
}

export class MemoryAccountStore implements AccountStore {
  private users = new Map<string, User>();
  private tokens = new Map<string, TokenRow>();
  private friends = new Map<string, Map<string, StoredFriend>>();
  private coinRefs = new Set<string>();
  private selfies = new Map<string, { gesture: VerifyGestureId; photo: string; createdAt: number }>();

  async init() {}

  async createUser(email: string, passwordHash: string) {
    const normalized = normalizeEmail(email);
    if ([...this.users.values()].some((u) => u.email === normalized)) return 'exists' as const;
    const user: User = {
      id: randomUUID(),
      email: normalized,
      passwordHash,
      emailVerified: false,
      createdAt: Date.now(),
      settings: { ...DEFAULT_SETTINGS },
      stripeCustomerId: null,
      plus: { ...NO_PLUS },
      coins: 0,
      boostUntil: null,
      verifiedAt: null,
      verifyStatus: null,
    };
    this.users.set(user.id, user);
    return user;
  }

  async userById(id: string) {
    return this.users.get(id) ?? null;
  }

  async userByEmail(email: string) {
    const normalized = normalizeEmail(email);
    return [...this.users.values()].find((u) => u.email === normalized) ?? null;
  }

  async updateSettings(id: string, settings: UserSettings) {
    const u = this.users.get(id);
    if (u) u.settings = settings;
  }

  async setPassword(id: string, passwordHash: string) {
    const u = this.users.get(id);
    if (u) u.passwordHash = passwordHash;
  }

  async markVerified(id: string) {
    const u = this.users.get(id);
    if (u) u.emailVerified = true;
  }

  async deleteUser(id: string) {
    this.users.delete(id);
    this.selfies.delete(id);
    await this.deleteTokensFor(id);
    for (const other of this.friends.get(id)?.keys() ?? []) this.friends.get(other)?.delete(id);
    this.friends.delete(id);
  }

  async createToken(userId: string, kind: TokenKind) {
    const raw = newToken();
    this.tokens.set(hashToken(raw), { userId, kind, expiresAt: Date.now() + TOKEN_TTL[kind] });
    return raw;
  }

  async useToken(raw: string, kind: TokenKind) {
    const key = hashToken(raw);
    const row = this.tokens.get(key);
    if (!row || row.kind !== kind) return null;
    if (row.expiresAt <= Date.now() || kind !== 'session') this.tokens.delete(key);
    if (row.expiresAt <= Date.now()) return null;
    return this.users.get(row.userId) ?? null;
  }

  async deleteToken(raw: string) {
    this.tokens.delete(hashToken(raw));
  }

  async deleteTokensFor(userId: string, kind?: TokenKind) {
    for (const [key, row] of this.tokens) if (row.userId === userId && (!kind || row.kind === kind)) this.tokens.delete(key);
  }

  async setStripeCustomer(userId: string, customerId: string) {
    const u = this.users.get(userId);
    if (u) u.stripeCustomerId = customerId;
  }

  async userByStripeCustomer(customerId: string) {
    return [...this.users.values()].find((u) => u.stripeCustomerId === customerId) ?? null;
  }

  async setPlus(userId: string, plus: StoredPlus) {
    const u = this.users.get(userId);
    if (u) u.plus = { ...plus };
  }

  async changeCoins(userId: string, delta: number, _reason: string, ref?: string) {
    const u = this.users.get(userId);
    if (!u) return null;
    if (ref) {
      if (this.coinRefs.has(ref)) return u.coins;
    }
    if (u.coins + delta < 0) return null;
    if (ref) this.coinRefs.add(ref);
    u.coins += delta;
    return u.coins;
  }

  async setBoost(userId: string, until: number | null) {
    const u = this.users.get(userId);
    if (u) u.boostUntil = until;
  }

  async submitVerification(userId: string, gesture: VerifyGestureId, photo: string) {
    const u = this.users.get(userId);
    if (!u) return;
    this.selfies.set(userId, { gesture, photo, createdAt: Date.now() });
    u.verifyStatus = 'pending';
  }

  async listPendingVerifications() {
    return [...this.selfies.entries()]
      .map(([userId, v]) => ({ userId, email: this.users.get(userId)?.email ?? '', ...v }))
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async resolveVerification(userId: string, approve: boolean) {
    const u = this.users.get(userId);
    if (!u || !this.selfies.delete(userId)) return false;
    u.verifyStatus = approve ? null : 'rejected';
    if (approve) u.verifiedAt = Date.now();
    return true;
  }

  async revokeVerification(userId: string) {
    const u = this.users.get(userId);
    if (u) u.verifiedAt = null;
  }

  async addFriend(userId: string, friendId: string, seen: { gender: string | null; country: string | null }) {
    if (!this.friends.has(userId)) this.friends.set(userId, new Map());
    const mine = this.friends.get(userId)!;
    if (!mine.has(friendId)) mine.set(friendId, { friendId, nickname: null, ...seen, createdAt: Date.now() });
  }

  async listFriends(userId: string) {
    return [...(this.friends.get(userId)?.values() ?? [])].sort((a, b) => b.createdAt - a.createdAt);
  }

  async isFriend(userId: string, friendId: string) {
    return !!this.friends.get(userId)?.has(friendId);
  }

  async removeFriendship(a: string, b: string) {
    this.friends.get(a)?.delete(b);
    this.friends.get(b)?.delete(a);
  }

  async renameFriend(userId: string, friendId: string, nickname: string | null) {
    const f = this.friends.get(userId)?.get(friendId);
    if (f) f.nickname = nickname;
  }
}

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
CREATE TABLE IF NOT EXISTS verifications (
  user_id TEXT PRIMARY KEY,
  gesture TEXT NOT NULL,
  photo TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
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
});

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

  async changeCoins(userId: string, delta: number, reason: string, ref?: string) {
    if (ref) {
      // The unique ref makes a repeated Stripe event a no-op.
      try {
        await this.pool.query('INSERT INTO coin_ledger (id, user_id, delta, reason, ref, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [
          randomUUID(),
          userId,
          delta,
          reason,
          ref,
          Date.now(),
        ]);
      } catch (e) {
        const err = e as { code?: string; message?: string };
        if (err.code === '23505' || /duplicate|unique/i.test(err.message ?? '')) {
          const { rows } = await this.pool.query('SELECT coins FROM users WHERE id = $1', [userId]);
          return rows[0] ? Number(rows[0].coins) : null;
        }
        throw e;
      }
    }
    // Atomic: never goes below zero.
    const { rows } = await this.pool.query('UPDATE users SET coins = coins + $2 WHERE id = $1 AND coins + $2 >= 0 RETURNING coins', [userId, delta]);
    if (!rows[0]) return null;
    if (!ref) {
      await this.pool.query('INSERT INTO coin_ledger (id, user_id, delta, reason, ref, created_at) VALUES ($1,$2,$3,$4,NULL,$5)', [
        randomUUID(),
        userId,
        delta,
        reason,
        Date.now(),
      ]);
    }
    return Number(rows[0].coins);
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
  }

  async renameFriend(userId: string, friendId: string, nickname: string | null) {
    await this.pool.query('UPDATE friends SET nickname = $3 WHERE user_id = $1 AND friend_id = $2', [userId, friendId, nickname]);
  }
}
