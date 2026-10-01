import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Pool } from 'pg';
import type { UserSettings } from '@rc/shared';

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

export type TokenKind = 'session' | 'verify' | 'reset';

export const TOKEN_TTL: Record<TokenKind, number> = {
  session: 30 * 24 * 3_600_000,
  verify: 48 * 3_600_000,
  reset: 3_600_000,
};

export const DEFAULT_SETTINGS: UserSettings = { gender: null, interests: [], allowReconnect: true, hideCountry: false };

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  emailVerified: boolean;
  createdAt: number;
  settings: UserSettings;
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
}

interface TokenRow {
  userId: string;
  kind: TokenKind;
  expiresAt: number;
}

export class MemoryAccountStore implements AccountStore {
  private users = new Map<string, User>();
  private tokens = new Map<string, TokenRow>();

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
    await this.deleteTokensFor(id);
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
`;

const toUser = (r: Record<string, unknown>): User => ({
  id: r.id as string,
  email: r.email as string,
  passwordHash: r.password_hash as string,
  emailVerified: !!r.email_verified,
  createdAt: Number(r.created_at),
  settings: { ...DEFAULT_SETTINGS, ...(JSON.parse((r.settings as string) || '{}') as Partial<UserSettings>) },
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
}
