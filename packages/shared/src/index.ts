/** Self-declared identity picked on the landing page. */
export type Gender = 'male' | 'female' | 'couple';

/** Video users only meet video users; text-only users only meet text-only users. */
export type ChatMode = 'video' | 'text';

export interface JoinPayload {
  gender: Gender;
  interests: string[];
  mode: ChatMode;
}

export interface PartnerInfo {
  gender: Gender;
  /** ISO 3166-1 alpha-2, or null when unknown. */
  country: string | null;
  sharedInterests: string[];
}

export interface MatchFound {
  matchId: string;
  mode: ChatMode;
  /** The initiator creates the WebRTC offer; the other side answers. */
  initiator: boolean;
  /** True when this match came from someone pressing Back. */
  reconnected: boolean;
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

export type BackUnavailableReason = 'no-previous' | 'gone' | 'busy' | 'declined';

export interface ChatMessage {
  text: string;
  /** Server receive time, ms since epoch. */
  at: number;
}

export interface CallResult {
  matchId: string;
  connected: boolean;
  /** Time from match to connected (or to giving up). */
  ms: number;
}

export interface Stats {
  online: number;
}

export interface ClientToServerEvents {
  'queue:join': (payload: JoinPayload) => void;
  'queue:leave': () => void;
  'call:next': () => void;
  'call:back': () => void;
  'call:result': (result: CallResult) => void;
  'settings:reconnect': (allow: boolean) => void;
  'chat:message': (text: string) => void;
  'chat:typing': (typing: boolean) => void;
  signal: (msg: SignalMessage) => void;
}

export interface ServerToClientEvents {
  'queue:waiting': () => void;
  'match:found': (match: MatchFound) => void;
  'partner:left': (reason: PartnerLeftReason) => void;
  'back:unavailable': (reason: BackUnavailableReason) => void;
  'chat:message': (msg: ChatMessage) => void;
  'chat:typing': (typing: boolean) => void;
  'chat:rejected': (reason: 'rate-limited' | 'invalid') => void;
  signal: (msg: SignalMessage) => void;
  stats: (stats: Stats) => void;
  'error:message': (message: string) => void;
}

export const MAX_INTERESTS = 10;
export const MAX_INTEREST_LENGTH = 24;
export const MAX_MESSAGE_LENGTH = 500;
/** Chat rate limit: at most this many messages per window. */
export const CHAT_BURST = 5;
export const CHAT_WINDOW_MS = 5_000;
