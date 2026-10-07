import {
  AVATARS,
  MAX_BIO,
  TOPICS,
  MAX_INTEREST_LENGTH,
  MAX_INTERESTS,
  MAX_MESSAGE_LENGTH,
  type CallResult,
  type ChatMode,
  type Gender,
  type JoinPayload,
  type SignalMessage,
  type MatchFilters,
  type UserProfile,
  type UserSettings,
} from '@rc/shared';
import { looksLikeLink } from './guard.ts';

const GENDERS: Gender[] = ['male', 'female', 'couple'];
const MODES: ChatMode[] = ['video', 'voice', 'text'];
const MAX_SDP_LENGTH = 20_000;

export function parseJoin(input: unknown): JoinPayload | null {
  if (!input || typeof input !== 'object') return null;
  const { gender, interests, mode } = input as Record<string, unknown>;
  if (!GENDERS.includes(gender as Gender)) return null;
  const cleaned = Array.isArray(interests)
    ? [
        ...new Set(
          interests
            .filter((i): i is string => typeof i === 'string')
            .map((i) => i.trim().toLowerCase().slice(0, MAX_INTEREST_LENGTH))
            .filter(Boolean),
        ),
      ].slice(0, MAX_INTERESTS)
    : [];
  // Older clients send no mode; treat them as video users.
  const chatMode = mode === undefined ? 'video' : MODES.includes(mode as ChatMode) ? (mode as ChatMode) : null;
  if (!chatMode) return null;
  const hideCountry = (input as Record<string, unknown>).hideCountry === true;
  const filters = parseFilters((input as Record<string, unknown>).filters) ?? undefined;
  const browse = (input as Record<string, unknown>).browse === true;
  const rawTopic = (input as Record<string, unknown>).topic;
  const topic = typeof rawTopic === 'string' && TOPICS.some((t) => t.id === rawTopic) ? rawTopic : null;
  return { gender: gender as Gender, interests: cleaned, mode: chatMode, hideCountry, filters, browse, topic };
}

export function parseSignal(input: unknown): SignalMessage | null {
  if (!input || typeof input !== 'object') return null;
  const msg = input as Record<string, unknown>;
  if ((msg.kind === 'offer' || msg.kind === 'answer') && typeof msg.sdp === 'string' && msg.sdp.length <= MAX_SDP_LENGTH) {
    return { kind: msg.kind, sdp: msg.sdp };
  }
  if (msg.kind === 'ice' && msg.candidate && typeof msg.candidate === 'object') {
    const c = msg.candidate as Record<string, unknown>;
    return {
      kind: 'ice',
      candidate: {
        candidate: typeof c.candidate === 'string' ? c.candidate.slice(0, 2_000) : undefined,
        sdpMid: typeof c.sdpMid === 'string' ? c.sdpMid : null,
        sdpMLineIndex: typeof c.sdpMLineIndex === 'number' ? c.sdpMLineIndex : null,
        usernameFragment: typeof c.usernameFragment === 'string' ? c.usernameFragment : null,
      },
    };
  }
  return null;
}

/** Trimmed message text, or null when empty, too long or not a string. */
export function parseChatText(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  // Strip control characters except newlines and tabs.
  const text = input.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim();
  if (!text || text.length > MAX_MESSAGE_LENGTH) return null;
  return text;
}

const CANDIDATE_TYPES = ['host', 'srflx', 'prflx', 'relay'] as const;
const OUTCOMES = ['connected', 'timeout', 'failed', 'dropped', 'relay'] as const;
const kinds = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.filter((t): t is (typeof CANDIDATE_TYPES)[number] => CANDIDATE_TYPES.includes(t)))] : [];

export function parseCallResult(input: unknown): CallResult | null {
  if (!input || typeof input !== 'object') return null;
  const { matchId, connected, ms, diag } = input as Record<string, unknown>;
  if (typeof matchId !== 'string' || typeof connected !== 'boolean' || typeof ms !== 'number') return null;
  if (!Number.isFinite(ms) || ms < 0 || ms > 120_000) return null;
  const result: CallResult = { matchId, connected, ms: Math.round(ms) };
  if (diag && typeof diag === 'object') {
    const d = diag as Record<string, unknown>;
    // Not deduplicated: a direct call is ['host', 'host'].
    const path = Array.isArray(d.path) && d.path.length === 2 && d.path.every((t) => CANDIDATE_TYPES.includes(t)) ? d.path : [];
    result.diag = {
      local: kinds(d.local),
      remote: kinds(d.remote),
      ice: typeof d.ice === 'string' ? d.ice.slice(0, 20) : 'unknown',
      outcome: OUTCOMES.includes(d.outcome as (typeof OUTCOMES)[number]) ? (d.outcome as (typeof OUTCOMES)[number]) : 'failed',
      ...(path.length === 2 ? { path: [path[0]!, path[1]!] } : {}),
    };
  }
  return result;
}

/** Validates settings sent by a client; unknown fields are ignored. */
export function parseSettings(input: unknown): UserSettings | null {
  if (!input || typeof input !== 'object') return null;
  const s = input as Record<string, unknown>;
  if (s.gender !== null && !GENDERS.includes(s.gender as Gender)) return null;
  if (typeof s.allowReconnect !== 'boolean' || typeof s.hideCountry !== 'boolean') return null;
  const join = parseJoin({ gender: s.gender ?? 'male', interests: s.interests, mode: 'video' });
  if (!join) return null;
  return {
    gender: (s.gender as Gender | null) ?? null,
    interests: join.interests,
    allowReconnect: s.allowReconnect,
    hideCountry: s.hideCountry,
    filters: parseFilters(s.filters) ?? { gender: 'any', country: 'any' },
    ...parseProfile(s),
  };
}

/** A safe profile card: a listed avatar and a short bio without links / handles (else empty). */
export function parseProfile(input: unknown): UserProfile {
  const p = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const avatar = typeof p.avatar === 'string' && (AVATARS as readonly string[]).includes(p.avatar) ? p.avatar : null;
  let bio = typeof p.bio === 'string' ? p.bio.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_BIO) : '';
  if (looksLikeLink(bio)) bio = '';
  return { avatar, bio };
}

/** Match filters, or null when malformed. Country is an ISO alpha-2 code. */
export function parseFilters(input: unknown): MatchFilters | null {
  if (!input || typeof input !== 'object') return null;
  const f = input as Record<string, unknown>;
  const gender = f.gender === 'any' || GENDERS.includes(f.gender as Gender) ? (f.gender as MatchFilters['gender']) : null;
  const country =
    f.country === 'any' ? 'any' : typeof f.country === 'string' && /^[A-Za-z]{2}$/.test(f.country) ? f.country.toUpperCase() : null;
  if (!gender || !country) return null;
  return f.verifiedOnly === true ? { gender, country, verifiedOnly: true } : { gender, country };
}
