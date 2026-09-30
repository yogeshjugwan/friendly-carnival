import { MAX_INTEREST_LENGTH, MAX_INTERESTS, type Gender, type JoinPayload, type SignalMessage } from '@rc/shared';

const GENDERS: Gender[] = ['male', 'female', 'couple'];
const MAX_SDP_LENGTH = 20_000;

export function parseJoin(input: unknown): JoinPayload | null {
  if (!input || typeof input !== 'object') return null;
  const { gender, interests } = input as Record<string, unknown>;
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
  return { gender: gender as Gender, interests: cleaned };
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
