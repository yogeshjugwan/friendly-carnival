import {
  MAX_INTEREST_LENGTH,
  MAX_INTERESTS,
  MAX_MESSAGE_LENGTH,
  type CallResult,
  type ChatMode,
  type Gender,
  type JoinPayload,
  type SignalMessage,
  type UserSettings,
} from '@rc/shared';

const GENDERS: Gender[] = ['male', 'female', 'couple'];
const MODES: ChatMode[] = ['video', 'text'];
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
  return { gender: gender as Gender, interests: cleaned, mode: chatMode, hideCountry };
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

export function parseCallResult(input: unknown): CallResult | null {
  if (!input || typeof input !== 'object') return null;
  const { matchId, connected, ms } = input as Record<string, unknown>;
  if (typeof matchId !== 'string' || typeof connected !== 'boolean' || typeof ms !== 'number') return null;
  if (!Number.isFinite(ms) || ms < 0 || ms > 120_000) return null;
  return { matchId, connected, ms: Math.round(ms) };
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
  };
}
