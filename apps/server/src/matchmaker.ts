import { randomUUID } from 'node:crypto';
import type { BackUnavailableReason, ChatMode, Gender } from '@rc/shared';

export interface Session {
  id: string;
  gender: Gender;
  interests: string[];
  mode: ChatMode;
  country: string | null;
  /** Partners see "location hidden" instead of the country. */
  hideCountry: boolean;
  /** Logged-in account, if any. */
  userId: string | null;
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
  /** Identity of recent sockets, kept after disconnect so "previous partner" can still be reported. */
  private identities = new Map<string, { deviceId: string; ipHash: string | null; userId: string | null }>();
  private static readonly IDENTITY_MEMORY = 10_000;

  constructor(private readonly recentMemory = 5) {}

  get onlineCount(): number {
    return this.sessions.size;
  }

  get waitingCount(): number {
    return this.queue.length;
  }

  connect(
    id: string,
    country: string | null,
    identity: { deviceId?: string; ipHash?: string | null; userId?: string | null; blocked?: Set<string> } = {},
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
      gender: 'male',
      interests: [],
      mode: 'video',
      country,
      hideCountry: false,
      userId,
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

  /** Record a block in every live session of both devices. */
  block(deviceA: string, deviceB: string): void {
    for (const s of this.sessions.values()) {
      if (s.deviceId === deviceA) s.blocked.add(deviceB);
      if (s.deviceId === deviceB) s.blocked.add(deviceA);
    }
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
  join(id: string, gender: Gender, interests: string[], mode: ChatMode, hideCountry = false): Pairing | null {
    const session = this.sessions.get(id);
    if (!session || session.partnerId) return null;
    session.gender = gender;
    session.interests = interests;
    session.mode = mode;
    session.hideCountry = hideCountry;
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
      return null;
    }
    this.dequeue(candidateId);
    return this.pair(this.sessions.get(candidateId)!, session, false);
  }

  private pickCandidate(session: Session): string | null {
    let best: string | null = null;
    let bestScore = -1;
    for (const otherId of this.queue) {
      if (otherId === session.id) continue;
      const other = this.sessions.get(otherId);
      if (!other || other.partnerId || other.mode !== session.mode) continue;
      if (session.recent.includes(otherId) || other.recent.includes(session.id)) continue;
      if (isBlocked(session, other)) continue;
      const score = sharedInterests(session.interests, other.interests).length;
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
  }
}

const isBlocked = (a: Session, b: Session) => a.blocked.has(b.deviceId) || b.blocked.has(a.deviceId);

export function sharedInterests(a: string[], b: string[]): string[] {
  const set = new Set(b);
  return a.filter((i) => set.has(i));
}
