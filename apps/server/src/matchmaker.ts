import { randomUUID } from 'node:crypto';
import type { Gender } from '@rc/shared';

export interface Session {
  id: string;
  gender: Gender;
  interests: string[];
  country: string | null;
  partnerId: string | null;
  matchId: string | null;
  /** Most recent partners first; never re-matched while listed. */
  recent: string[];
}

export interface Pairing {
  matchId: string;
  a: Session;
  b: Session;
  sharedInterests: string[];
}

/**
 * Single-node, in-memory matchmaker. Waiting users sit in a FIFO queue;
 * a newcomer pairs with the waiting user who shares the most interests,
 * falling back to whoever has waited longest. Recent partners are skipped.
 */
export class Matchmaker {
  private sessions = new Map<string, Session>();
  private queue: string[] = [];

  constructor(private readonly recentMemory = 5) {}

  get onlineCount(): number {
    return this.sessions.size;
  }

  get waitingCount(): number {
    return this.queue.length;
  }

  connect(id: string, country: string | null): Session {
    const session: Session = {
      id,
      gender: 'male',
      interests: [],
      country,
      partnerId: null,
      matchId: null,
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

  /** Queue a session; returns a pairing if a partner was available right away. */
  join(id: string, gender: Gender, interests: string[]): Pairing | null {
    const session = this.sessions.get(id);
    if (!session || session.partnerId) return null;
    session.gender = gender;
    session.interests = interests;
    this.dequeue(id);

    const candidateId = this.pickCandidate(session);
    if (!candidateId) {
      this.queue.push(id);
      return null;
    }
    this.dequeue(candidateId);
    return this.pair(this.sessions.get(candidateId)!, session);
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

  private pickCandidate(session: Session): string | null {
    let best: string | null = null;
    let bestScore = -1;
    for (const otherId of this.queue) {
      if (otherId === session.id) continue;
      const other = this.sessions.get(otherId);
      if (!other || other.partnerId) continue;
      if (session.recent.includes(otherId) || other.recent.includes(session.id)) continue;
      const score = sharedInterests(session.interests, other.interests).length;
      // Queue is oldest-first, so strict ">" keeps the longest waiter on ties.
      if (score > bestScore) {
        best = otherId;
        bestScore = score;
      }
    }
    return best;
  }

  private pair(a: Session, b: Session): Pairing {
    const matchId = randomUUID();
    a.partnerId = b.id;
    b.partnerId = a.id;
    a.matchId = matchId;
    b.matchId = matchId;
    this.remember(a, b.id);
    this.remember(b, a.id);
    return { matchId, a, b, sharedInterests: sharedInterests(a.interests, b.interests) };
  }

  private remember(session: Session, partnerId: string): void {
    session.recent = [partnerId, ...session.recent.filter((r) => r !== partnerId)].slice(0, this.recentMemory);
  }

  private dequeue(id: string): void {
    const index = this.queue.indexOf(id);
    if (index !== -1) this.queue.splice(index, 1);
  }
}

export function sharedInterests(a: string[], b: string[]): string[] {
  const set = new Set(b);
  return a.filter((i) => set.has(i));
}
