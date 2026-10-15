import { randomUUID } from 'node:crypto';
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
  type StoredFriend,
  type StoredPlus,
  type User,
  type TokenKind,
  type PaymentRecord,
  type PaymentCredit,
} from './accounts-types.ts';


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
  private refCodes = new Map<string, string>();
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
      referredBy: null,
      referralRewarded: false,
      streakDays: 0,
      streakLastDay: null,
      trialUsed: false,
      birthDate: null,
      ageReview: false,
      lastSeenAt: null,
      emailOptOut: false,
      lastWinbackAt: null,
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
    this.messages = this.messages.filter((m) => m.from !== id && m.to !== id);
    this.history = this.history.filter((h) => h.userId !== id && h.partnerUserId !== id);
    for (const f of [...this.follows]) if (f.startsWith(`${id}>`) || f.endsWith(`>${id}`)) this.follows.delete(f);
    for (const [endpoint, p] of this.pushSubs) if (p.userId === id) this.pushSubs.delete(endpoint);
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

  async changeCoins(userId: string, delta: number, reason: string, ref?: string) {
    const u = this.users.get(userId);
    if (!u) return null;
    if (ref) {
      if (this.coinRefs.has(ref)) return u.coins;
    }
    if (u.coins + delta < 0) return null;
    if (ref) this.coinRefs.add(ref);
    u.coins += delta;
    if (reason === 'purchase') this.purchases.push({ at: Date.now(), coins: delta });
    return u.coins;
  }

  private purchases: { at: number; coins: number }[] = [];
  private secrets = new Map<string, string>();
  private pushSubs = new Map<string, { userId: string; sub: PushSubscriptionJSON }>();

  async appSecret(key: string) {
    return this.secrets.get(key) ?? null;
  }

  private messages: StoredMessage[] = [];
  private history: HistoryRow[] = [];
  private follows = new Set<string>();

  async addHistory(entry: Omit<HistoryRow, 'id'>) {
    this.history.push({ ...entry, id: randomUUID() });
  }

  async historyOf(userId: string, limit: number) {
    return this.history
      .filter((h) => h.userId === userId)
      .sort((a, b) => b.at - a.at)
      .slice(0, limit);
  }

  async removeHistory(userId: string, partnerKey: string) {
    this.history = this.history.filter((h) => !(h.userId === userId && h.partnerKey === partnerKey));
  }

  async follow(follower: string, followee: string, on: boolean) {
    if (on) this.follows.add(`${follower}>${followee}`);
    else this.follows.delete(`${follower}>${followee}`);
  }

  async following(follower: string) {
    return new Set([...this.follows].filter((f) => f.startsWith(`${follower}>`)).map((f) => f.slice(follower.length + 1)));
  }

  async followers(followee: string) {
    return [...this.follows].filter((f) => f.endsWith(`>${followee}`)).map((f) => f.split('>')[0]!);
  }

  async threadsOf(userId: string) {
    const byOther = new Map<string, { other: string; last: StoredMessage; unread: number; mine: number; theirs: number }>();
    for (const m of this.messages) {
      if (m.from !== userId && m.to !== userId) continue;
      const other = m.from === userId ? m.to : m.from;
      const t = byOther.get(other) ?? { other, last: m, unread: 0, mine: 0, theirs: 0 };
      if (m.at >= t.last.at) t.last = m;
      if (m.from === userId) t.mine++;
      else {
        t.theirs++;
        if (!m.readAt) t.unread++;
      }
      byOther.set(other, t);
    }
    return [...byOther.values()].sort((a, b) => b.last.at - a.last.at);
  }

  async touchLastSeen(userId: string, at: number) {
    const u = this.users.get(userId);
    if (u) u.lastSeenAt = at;
  }

  async setEmailOptOut(userId: string, optOut: boolean) {
    const u = this.users.get(userId);
    if (u) u.emailOptOut = optOut;
  }

  async winbackCandidates(awaySince: number, lastSentBefore: number, limit: number) {
    return [...this.users.values()]
      .filter(
        (u) =>
          u.emailVerified &&
          !u.emailOptOut &&
          (u.lastSeenAt ?? u.createdAt) < awaySince &&
          (u.lastWinbackAt === null || u.lastWinbackAt < lastSentBefore),
      )
      .slice(0, limit);
  }

  async markWinbackSent(userId: string, at: number) {
    const u = this.users.get(userId);
    if (u) u.lastWinbackAt = at;
  }

  async setBirthDate(userId: string, birthDate: string) {
    const u = this.users.get(userId);
    if (!u || u.birthDate) return false;
    u.birthDate = birthDate;
    return true;
  }

  async setAgeReview(userId: string, on: boolean) {
    const u = this.users.get(userId);
    if (u) u.ageReview = on;
  }

  private payments = new Set<string>();
  async recordPayment(ref: string) {
    if (this.payments.has(ref)) return false;
    this.payments.add(ref);
    return true;
  }

  async applyPayment(p: PaymentRecord, credit: PaymentCredit) {
    if (this.payments.has(p.ref)) return false;
    // Credit first; the payment is recorded only once it was delivered.
    if ('coins' in credit) {
      if ((await this.changeCoins(p.userId, credit.coins, 'purchase', p.ref)) === null) throw new Error('credit failed');
    } else {
      await this.setPlus(p.userId, credit.plus);
    }
    this.payments.add(p.ref);
    return true;
  }

  async transferCoins(from: string, to: string | null, amount: number, earned: number, reason: string, receivedReason: string) {
    const sender = this.users.get(from);
    if (!sender || sender.coins - amount < 0) return null;
    const receiver = to && earned > 0 ? this.users.get(to) : undefined;
    // Both legs in one synchronous step: nothing can fail half-way.
    sender.coins -= amount;
    if (receiver) receiver.coins += earned;
    void reason;
    void receivedReason;
    return sender.coins;
  }

  async useTrial(userId: string) {
    const u = this.users.get(userId);
    if (!u || u.trialUsed) return false;
    u.trialUsed = true;
    return true;
  }

  async addMessage(from: string, to: string, text: string) {
    const m: StoredMessage = { id: randomUUID(), from, to, text, at: Date.now(), readAt: null };
    this.messages.push(m);
    return m;
  }

  async messagesBetween(a: string, b: string, limit: number) {
    return this.messages.filter((m) => (m.from === a && m.to === b) || (m.from === b && m.to === a)).slice(-limit);
  }

  async markRead(to: string, from: string) {
    const now = Date.now();
    for (const m of this.messages) if (m.to === to && m.from === from && !m.readAt) m.readAt = now;
  }

  async unreadCounts(to: string) {
    const counts = new Map<string, number>();
    for (const m of this.messages) if (m.to === to && !m.readAt) counts.set(m.from, (counts.get(m.from) ?? 0) + 1);
    return counts;
  }

  async setStreak(userId: string, days: number, lastDay: string, previousDay: string | null) {
    const u = this.users.get(userId);
    if (!u || u.streakLastDay !== previousDay) return false;
    u.streakDays = days;
    u.streakLastDay = lastDay;
    return true;
  }

  async initAppSecret(key: string, value: string) {
    if (!this.secrets.has(key)) this.secrets.set(key, value);
    return this.secrets.get(key)!;
  }

  async addPushSubscription(userId: string, sub: PushSubscriptionJSON) {
    this.pushSubs.set(sub.endpoint, { userId, sub });
  }

  async removePushSubscription(endpoint: string) {
    this.pushSubs.delete(endpoint);
  }

  async pushSubscriptions(userId: string) {
    return [...this.pushSubs.values()].filter((p) => p.userId === userId).map((p) => p.sub);
  }

  async accountStats(since: number): Promise<AccountStats> {
    const all = [...this.users.values()];
    return {
      users: all.length,
      plusActive: all.filter((u) => isPlusActive(u.plus)).length,
      verified: all.filter((u) => u.verifiedAt).length,
      signups: all.map((u) => u.createdAt).filter((t) => t >= since),
      purchases: this.purchases.filter((p) => p.at >= since),
    };
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

  async referralCode(userId: string) {
    for (const [code, id] of this.refCodes) if (id === userId) return code;
    let code = newRefCode();
    while (this.refCodes.has(code)) code = newRefCode();
    this.refCodes.set(code, userId);
    return code;
  }

  async userByReferralCode(code: string) {
    const id = this.refCodes.get(code.toLowerCase());
    return id ? (this.users.get(id) ?? null) : null;
  }

  async setReferredBy(userId: string, referrerId: string) {
    const u = this.users.get(userId);
    if (!u || u.referredBy) return false;
    u.referredBy = referrerId;
    return true;
  }

  async markReferralRewarded(userId: string) {
    const u = this.users.get(userId);
    if (!u || u.referralRewarded) return false;
    u.referralRewarded = true;
    return true;
  }

  async referralCounts(referrerId: string) {
    const mine = [...this.users.values()].filter((u) => u.referredBy === referrerId);
    return { invited: mine.length, rewarded: mine.filter((u) => u.referralRewarded).length };
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
    this.messages = this.messages.filter((m) => !((m.from === a && m.to === b) || (m.from === b && m.to === a)));
  }

  async renameFriend(userId: string, friendId: string, nickname: string | null) {
    const f = this.friends.get(userId)?.get(friendId);
    if (f) f.nickname = nickname;
  }
}
