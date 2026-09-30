/** Self-declared identity picked on the landing page. */
export type Gender = 'male' | 'female' | 'couple';

export interface JoinPayload {
  gender: Gender;
  interests: string[];
}

export interface PartnerInfo {
  gender: Gender;
  /** ISO 3166-1 alpha-2, or null when unknown. */
  country: string | null;
  sharedInterests: string[];
}

export interface MatchFound {
  matchId: string;
  /** The initiator creates the WebRTC offer; the other side answers. */
  initiator: boolean;
  partner: PartnerInfo;
  iceServers: RTCIceServerLike[];
}

export interface RTCIceServerLike {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export type SignalMessage =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: RTCIceCandidateInitLike };

export interface RTCIceCandidateInitLike {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export type PartnerLeftReason = 'next' | 'stop' | 'disconnect';

export interface Stats {
  online: number;
}

export interface ClientToServerEvents {
  'queue:join': (payload: JoinPayload) => void;
  'queue:leave': () => void;
  'call:next': () => void;
  signal: (msg: SignalMessage) => void;
}

export interface ServerToClientEvents {
  'queue:waiting': () => void;
  'match:found': (match: MatchFound) => void;
  'partner:left': (reason: PartnerLeftReason) => void;
  signal: (msg: SignalMessage) => void;
  stats: (stats: Stats) => void;
  'error:message': (message: string) => void;
}

export const MAX_INTERESTS = 10;
export const MAX_INTEREST_LENGTH = 24;
