import { randomUUID } from 'node:crypto';
import { NO_FILTERS, type ActiveUser, type BackUnavailableReason, type ChatMode, type Gender, type MatchFilters } from '@rc/shared';

export interface Session {
  id: string;
  /** Shown on the Plus "Online now" list instead of the socket id. */
  publicId: string;
  /** Has joined the call screen (queue or browse) at least once, so their profile is set. */
  joined: boolean;
  /** Topic room picked on the home page, if any. */
  topic: string | null;
  gender: Gender;
  interests: string[];
  mode: ChatMode;
  country: string | null;
  /** Partners see "location hidden" instead of the country. */
  hideCountry: boolean;
  /** Logged-in account, if any. */
  userId: string | null;
  /** Active Plus subscription. */
  plus: boolean;
  /** Plus match filters (always NO_FILTERS without Plus). */
  filters: MatchFilters;
  /** Persistent browser id (from the handshake); falls back to the socket id. */
  deviceId: string;
  ipHash: string | null;
  /** Devices this user blocked or was blocked by; never matched with them. */
  blocked: Set<string>;
  partnerId: string | null;
  matchId: string | null;
  /** Whether skipped partners may press Back to reach this user again. */
  allowReconnect: boolean;
  /** Most recent partners first; never re-matched at random while listed. */
  recent: string[];
}

export interface Pairing {
  matchId: string;
  a: Session;
  b: Session;
  sharedInterests: string[];
  reconnected: boolean;
}

/**
 * Single-node, in-memory matchmaker. Waiting users sit in a FIFO queue;
 * a newcomer pairs with the waiting user of the same mode who shares the most
 * interests, falling back to whoever has waited longest. Recent partners are
 * skipped, except through an explicit Back.
 */
export class Matchmaker {
  private sessions = new Map<string, Session>();
  private queue: string[] = [];
  /** When each waiting session entered the queue. */
  private queuedAt = new Map<string, number>();
  /** Identity of recent sockets, kept after disconnect so "previous partner" can still be reported. */
  private identities = new Map<string, { deviceId: string; ipHash: string | null; userId: string | null }>();
  private static readonly IDENTITY_MEMORY = 10_000;

  /**
   * @param recentMemory partners avoided right after a match
   * @param relaxAfterMs after both have waited this long, recent partners may meet
   *   again — with few people online, otherwise nobody would ever be matched
   */
  constructor(
    private readonly recentMemory = 5,
    private readonly relaxAfterMs = 8_000,
  ) {}

  get onlineCount(): number {
    return this.sessions.size;
  }

  get waitingCount(): number {
    return this.queue.length;
  }

  connect(
    id: string,
    country: string | null,
    identity: { deviceId?: string; ipHash?: string | null; userId?: string | null; plus?: boolean; blocked?: Set<string> } = {},
  ): Session {
    const deviceId = identity.deviceId ?? id;
    const ipHash = identity.ipHash ?? null;
    const userId = identity.userId ?? null;
    this.identities.set(id, { deviceId, ipHash, userId });
    if (this.identities.size > Matchmaker.IDENTITY_MEMORY) {
      this.identities.delete(this.identities.keys().next().value!);
    }
    const session: Session = {
      id,
      publicId: randomUUID().replace(/-/g, '').slice(0, 16),
      joined: false,
      topic: null,
      gender: 'male',
      interests: [],
      mode: 'video',
      country,
      hideCountry: false,
      userId,
      plus: identity.plus ?? false,
      filters: { ...NO_FILTERS },
      deviceId,
      ipHash,
      blocked: identity.blocked ?? new Set(),
      partnerId: null,
      matchId: null,
      allowReconnect: true,
      recent: [],
    };
    this.sessions.set(id, session);
    return session;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  partnerOf(id: string): Session | undefined {
    const partnerId = this.sessions.get(id)?.partnerId;
    return partnerId ? this.sessions.get(partnerId) : undefined;
  }

  /** Device + IP hash of a socket, even if it has since disconnected. */
  identityOf(socketId: string): { deviceId: string; ipHash: string | null; userId: string | null } | undefined {
    return this.identities.get(socketId);
  }

  /** The partner before the current one (or the last one, when not in a call). */
  previousPartnerId(id: string): string | undefined {
    const s = this.sessions.get(id);
    if (!s) return undefined;
    return s.partnerId ? s.recent[1] : s.recent[0];
  }

  /** Update Plus on every live session of an account (after a payment or cancellation). */
  setPlus(userId: string, plus: boolean): void {
    for (const s of this.sessions.values()) {
      if (s.userId !== userId) continue;
      s.plus = plus;
      if (!plus) s.filters = { ...NO_FILTERS };
    }
  }

  /** Record a block in every live session of both devices. */
  block(deviceA: string, deviceB: string): void {
    for (const s of this.sessions.values()) {
      if (s.deviceId === deviceA) s.blocked.add(deviceB);
      if (s.deviceId === deviceB) s.blocked.add(deviceA);
    }
  }

  /** Replaces the blocked set of every session on this device (after an unblock). */
  setBlocked(deviceId: string, blocked: Set<string>): void {
    for (const s of this.sessions.values()) if (s.deviceId === deviceId) s.blocked = new Set(blocked);
  }

  /** Socket ids currently connected for a device or IP hash. */
  socketsFor(deviceId: string, ipHash: string | null, userId: string | null = null): string[] {
    return [...this.sessions.values()]
      .filter((s) => s.deviceId === deviceId || (ipHash !== null && s.ipHash === ipHash) || (userId !== null && s.userId === userId))
      .map((s) => s.id);
  }

  isWaiting(id: string): boolean {
    return this.queue.includes(id);
  }

  setAllowReconnect(id: string, allow: boolean): void {
    const session = this.sessions.get(id);
    if (session) session.allowReconnect = allow;
  }

  /** Queue a session; returns a pairing if a partner was available right away. */
  join(
    id: string,
    gender: Gender,
    interests: string[],
    mode: ChatMode,
    hideCountry = false,
    filters: MatchFilters = NO_FILTERS,
    browse = false,
    topic: string | null = null,
  ): Pairing | null {
    const session = this.sessions.get(id);
    if (!session || session.partnerId) return null;
    session.joined = true;
    session.topic = topic;
    session.gender = gender;
    session.interests = interests;
    session.mode = mode;
    session.hideCountry = hideCountry;
    // Filters are a Plus feature; the server never trusts the client on this.
    session.filters = session.plus ? { ...filters } : { ...NO_FILTERS };
    // Browsing (Plus): profile set so they can call people, but not queued for random matches.
    if (browse && session.plus) {
      this.dequeue(id);
      return null;
    }
    return this.requeue(session);
  }

  /** Re-queue with the session's current preferences (used by Next). */
  rejoin(id: string): Pairing | null {
    const session = this.sessions.get(id);
    if (!session || session.partnerId) return null;
    return this.requeue(session);
  }

  /**
   * Back: reconnect with the most recent partner, if they are still searching,
   * use the same mode and allow reconnects.
   */
  reconnect(id: string): Pairing | BackUnavailableReason {
    const session = this.sessions.get(id);
    // Mid-call, recent[0] is the current partner, so "previous" is one further back.
    const lastId = this.previousPartnerId(id);
    if (!session || !lastId) return 'no-previous';
    const last = this.sessions.get(lastId);
    if (!last) return 'gone';
    if (!last.allowReconnect || isBlocked(session, last)) return 'declined';
    if (last.partnerId || !this.isWaiting(lastId) || last.mode !== session.mode) return 'busy';

    this.endMatch(id);
    this.dequeue(id);
    this.dequeue(lastId);
    return this.pair(last, session, true);
  }

  /**
   * People searching or in a call right now, for the Plus list: waiting first
   * (longest wait first), never the viewer, their partner or anyone either side blocked.
   */
  listActive(viewerId: string, limit = 100): ActiveUser[] {
    const viewer = this.sessions.get(viewerId);
    const view = (s: Session, state: ActiveUser['state']): ActiveUser => ({
      publicId: s.publicId,
      gender: s.gender,
      country: s.hideCountry ? null : s.country,
      locationHidden: s.hideCountry,
      interests: s.interests,
      plus: s.plus,
      mode: s.mode,
      state,
    });
    const visible = (s: Session | undefined): s is Session =>
      !!s && s.id !== viewerId && s.id !== viewer?.partnerId && !(viewer && isBlocked(viewer, s));
    const waiting = this.queue.map((id) => this.sessions.get(id)).filter(visible).map((s) => view(s, 'waiting'));
    const busy = [...this.sessions.values()].filter((s) => s.partnerId && visible(s)).map((s) => view(s, 'in-call'));
    return [...waiting, ...busy].slice(0, limit);
  }

  byPublicId(publicId: string): Session | undefined {
    for (const s of this.sessions.values()) if (s.publicId === publicId) return s;
    return undefined;
  }

  /**
   * Can `fromId` call `toId` directly? The target must be searching in the same
   * mode, not blocked either way, and their own filters must accept the caller.
   */
  canCall(fromId: string, toId: string, friend = false): 'ok' | 'gone' | 'busy' | 'unavailable' | 'mode' {
    const from = this.sessions.get(fromId);
    const to = this.sessions.get(toId);
    if (!from || !to) return 'gone';
    // Friends skip each other's match filters; blocks always apply.
    if (isBlocked(from, to) || (!friend && !wants(to, from))) return 'unavailable';
    if (to.mode !== from.mode) return 'mode';
    // Strangers must be searching; friends may also be browsing (joined, not in a call).
    if (to.partnerId || (friend ? !to.joined : !this.isWaiting(toId))) return 'busy';
    return 'ok';
  }

  /** Pairs two people after an accepted call request (ends the caller's current match first). */
  pairDirect(fromId: string, toId: string, friend = false): Pairing | 'gone' | 'busy' | 'unavailable' | 'mode' {
    const check = this.canCall(fromId, toId, friend);
    if (check !== 'ok') return check;
    this.endMatch(fromId);
    this.dequeue(fromId);
    this.dequeue(toId);
    return this.pair(this.sessions.get(fromId)!, this.sessions.get(toId)!, false);
  }

  leaveQueue(id: string): void {
    this.dequeue(id);
  }

  /** Ends the session's current match. Returns the former partner, if any. */
  endMatch(id: string): Session | undefined {
    const session = this.sessions.get(id);
    const partner = this.partnerOf(id);
    if (session) {
      session.partnerId = null;
      session.matchId = null;
    }
    if (partner) {
      partner.partnerId = null;
      partner.matchId = null;
    }
    return partner;
  }

  /** Removes a session entirely. Returns the former partner, if any. */
  disconnect(id: string): Session | undefined {
    const partner = this.endMatch(id);
    this.dequeue(id);
    this.sessions.delete(id);
    return partner;
  }

  private requeue(session: Session): Pairing | null {
    this.dequeue(session.id);
    const candidateId = this.pickCandidate(session);
    if (!candidateId) {
      this.queue.push(session.id);
      this.queuedAt.set(session.id, Date.now());
      return null;
    }
    this.dequeue(candidateId);
    return this.pair(this.sessions.get(candidateId)!, session, false);
  }

  /**
   * Matches people who have waited a while, allowing recent partners to meet
   * again once both have waited `relaxAfterMs`. Call it every few seconds.
   */
  sweep(now = Date.now()): Pairing[] {
    const pairings: Pairing[] = [];
    for (const id of [...this.queue]) {
      if (!this.queue.includes(id)) continue; // paired earlier in this sweep
      const session = this.sessions.get(id);
      if (!session || session.partnerId) continue;
      if (now - (this.queuedAt.get(id) ?? now) < this.relaxAfterMs) continue;
      const candidateId = this.pickCandidate(session, now);
      if (!candidateId) continue;
      this.dequeue(id);
      this.dequeue(candidateId);
      pairings.push(this.pair(this.sessions.get(candidateId)!, session, false));
    }
    return pairings;
  }

  private pickCandidate(session: Session, relaxedAt?: number): string | null {
    let best: string | null = null;
    let bestScore = -1;
    for (const otherId of this.queue) {
      if (otherId === session.id) continue;
      const other = this.sessions.get(otherId);
      if (!other || other.partnerId || other.mode !== session.mode) continue;
      const recent = session.recent.includes(otherId) || other.recent.includes(session.id);
      // Recent partners only meet again in a sweep, after both waited long enough.
      if (recent && (relaxedAt === undefined || relaxedAt - (this.queuedAt.get(otherId) ?? relaxedAt) < this.relaxAfterMs)) continue;
      if (isBlocked(session, other)) continue;
      if (!wants(session, other) || !wants(other, session)) continue;
      // Topic rooms: a different topic only after both have waited (in a sweep).
      const sameTopic = session.topic === other.topic;
      if (!sameTopic && (relaxedAt === undefined || relaxedAt - (this.queuedAt.get(otherId) ?? relaxedAt) < this.relaxAfterMs)) continue;
      const score = sharedInterests(session.interests, other.interests).length + (sameTopic && session.topic ? 10 : 0);
      // Queue is oldest-first, so strict ">" keeps the longest waiter on ties.
      if (score > bestScore) {
        best = otherId;
        bestScore = score;
      }
    }
    return best;
  }

  private pair(a: Session, b: Session, reconnected: boolean): Pairing {
    const matchId = randomUUID();
    a.partnerId = b.id;
    b.partnerId = a.id;
    a.matchId = matchId;
    b.matchId = matchId;
    this.remember(a, b.id);
    this.remember(b, a.id);
    return { matchId, a, b, sharedInterests: sharedInterests(a.interests, b.interests), reconnected };
  }

  private remember(session: Session, partnerId: string): void {
    session.recent = [partnerId, ...session.recent.filter((r) => r !== partnerId)].slice(0, this.recentMemory);
  }

  private dequeue(id: string): void {
    const index = this.queue.indexOf(id);
    if (index !== -1) this.queue.splice(index, 1);
    this.queuedAt.delete(id);
  }
}

/** Does `a`'s filter accept `b`? Hidden-country users never match a country filter. */
const wants = (a: Session, b: Session) =>
  (a.filters.gender === 'any' || a.filters.gender === b.gender) &&
  (a.filters.country === 'any' || (!b.hideCountry && b.country === a.filters.country));

const isBlocked = (a: Session, b: Session) => a.blocked.has(b.deviceId) || b.blocked.has(a.deviceId);

export function sharedInterests(a: string[], b: string[]): string[] {
  const set = new Set(b);
  return a.filter((i) => set.has(i));
}
