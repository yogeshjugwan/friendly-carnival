/**
 * Account types, the AccountStore interface and helpers shared by the
 * in-memory (accounts-memory.ts) and Postgres (accounts-postgres.ts) stores.
 */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { NO_FILTERS, type PendingVerification, type PushSubscriptionJSON, type PlusPlan, type PlusStatus, type UserSettings, type VerifyGestureId } from '@rc/shared';

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
/** 'pass' = prepaid Plus bought with Razorpay. */
const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due', 'admin', 'pass']);

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
  /** Account whose invite link this user signed up with. */
  referredBy: string | null;
  /** The invite reward for this user was paid out. */
  referralRewarded: boolean;
  /** Daily streak: days in a row, and the last day claimed ('YYYY-MM-DD', IST). */
  streakDays: number;
  streakLastDay: string | null;
  /** The free Plus trial was used. */
  trialUsed: boolean;
  /** 'YYYY-MM-DD', or null if not given yet. */
  birthDate: string | null;
  /** Reported as underage: chatting paused until ✓ verified. */
  ageReview: boolean;
  /** Last time the user had the site open (updated at most hourly). */
  lastSeenAt: number | null;
  /** Unsubscribed from activity emails. */
  emailOptOut: boolean;
  /** Last win-back email sent. */
  lastWinbackAt: number | null;
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
export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');

/** Short, unambiguous invite code (no 0/o/1/l). */
const REF_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
export const newRefCode = () => [...randomBytes(8)].map((b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export interface PaymentRecord {
  ref: string;
  userId: string;
  product: string;
  amount: number;
}
export type PaymentCredit = { coins: number } | { plus: StoredPlus };

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
  /** The user's invite code (created on first use). */
  referralCode(userId: string): Promise<string>;
  userByReferralCode(code: string): Promise<User | null>;
  /** Records who invited the user; false if they already have a referrer. */
  setReferredBy(userId: string, referrerId: string): Promise<boolean>;
  /** Marks the invite reward paid; false if it already was (so it pays once). */
  markReferralRewarded(userId: string): Promise<boolean>;
  referralCounts(referrerId: string): Promise<{ invited: number; rewarded: number }>;
  /** Stores a message between friends. */
  addMessage(from: string, to: string, text: string): Promise<StoredMessage>;
  /** The latest `limit` messages between two users, oldest first. */
  messagesBetween(a: string, b: string, limit: number): Promise<StoredMessage[]>;
  /** Marks messages from `from` to `to` as read. */
  markRead(to: string, from: string): Promise<void>;
  /** Unread messages for `to`, by sender. */
  unreadCounts(to: string): Promise<Map<string, number>>;
  /** Records a payment once; false if this reference was already recorded. */
  recordPayment(ref: string, userId: string, product: string, amount: number): Promise<boolean>;
  /**
   * Records a payment and delivers it (coins or a Plus value) atomically: if the
   * credit fails nothing is recorded, so a retry delivers. False if already applied.
   */
  applyPayment(payment: PaymentRecord, credit: PaymentCredit): Promise<boolean>;
  /**
   * Moves coins atomically: debits `amount` from `from` and credits `earned` to `to`
   * (if given). Returns the sender's new balance, or null when they can't afford it.
   */
  transferCoins(from: string, to: string | null, amount: number, earned: number, reason: string, receivedReason: string): Promise<number | null>;
  touchLastSeen(userId: string, at: number): Promise<void>;
  setEmailOptOut(userId: string, optOut: boolean): Promise<void>;
  /** Users to send a win-back email to: confirmed email, not opted out, away since `awaySince`, none sent since `lastSentBefore`. */
  winbackCandidates(awaySince: number, lastSentBefore: number, limit: number): Promise<User[]>;
  markWinbackSent(userId: string, at: number): Promise<void>;
  /** Sets the birth date once; false if one is already stored. */
  setBirthDate(userId: string, birthDate: string): Promise<boolean>;
  setAgeReview(userId: string, on: boolean): Promise<void>;
  /** Marks the free trial used; false if it already was. */
  useTrial(userId: string): Promise<boolean>;
  /** Records a daily claim; false if `day` was already claimed. */
  setStreak(userId: string, days: number, lastDay: string, previousDay: string | null): Promise<boolean>;
  /** Small server-wide secrets (e.g. the Web Push keys). */
  appSecret(key: string): Promise<string | null>;
  /** Stores a secret unless one exists; returns the stored value either way. */
  initAppSecret(key: string, value: string): Promise<string>;
  addPushSubscription(userId: string, sub: PushSubscriptionJSON): Promise<void>;
  removePushSubscription(endpoint: string): Promise<void>;
  pushSubscriptions(userId: string): Promise<PushSubscriptionJSON[]>;
  /** Totals and per-day sign-ups / coin purchases since a time, for admin analytics. */
  accountStats(since: number): Promise<AccountStats>;
  /** One direction of a friendship: what `userId` saw of `friendId`, plus their nickname for them. */
  addFriend(userId: string, friendId: string, seen: { gender: string | null; country: string | null }): Promise<void>;
  /** History: one row per match, as `userId` saw the partner. */
  addHistory(entry: Omit<HistoryRow, 'id'>): Promise<void>;
  /** The newest `limit` history rows of a user. */
  historyOf(userId: string, limit: number): Promise<HistoryRow[]>;
  /** Forget everything about one partner (by partnerKey). */
  removeHistory(userId: string, partnerKey: string): Promise<void>;
  follow(follower: string, followee: string, on: boolean): Promise<void>;
  following(follower: string): Promise<Set<string>>;
  followers(followee: string): Promise<string[]>;
  /** Counterparts of a user's conversations with the latest message and unread count. */
  threadsOf(userId: string): Promise<{ other: string; last: StoredMessage; unread: number; mine: number; theirs: number }[]>;
  listFriends(userId: string): Promise<StoredFriend[]>;
  isFriend(userId: string, friendId: string): Promise<boolean>;
  /** Removes both directions. */
  removeFriendship(a: string, b: string): Promise<void>;
  renameFriend(userId: string, friendId: string, nickname: string | null): Promise<void>;
}

export interface AccountStats {
  users: number;
  plusActive: number;
  verified: number;
  /** Sign-up times since `since` (ms). */
  signups: number[];
  /** Coin purchases since `since`: when and how many coins. */
  purchases: { at: number; coins: number }[];
}

export interface HistoryRow {
  id: string;
  userId: string;
  /** Account id of the partner, or a hashed device for guests. */
  partnerKey: string;
  partnerUserId: string | null;
  name: string;
  avatar: string | null;
  gender: string | null;
  country: string | null;
  mode: string;
  at: number;
}

export interface StoredMessage {
  id: string;
  from: string;
  to: string;
  text: string;
  at: number;
  readAt: number | null;
}

export interface StoredFriend {
  friendId: string;
  nickname: string | null;
  gender: string | null;
  country: string | null;
  createdAt: number;
}

export const MAX_FRIENDS = 200;
