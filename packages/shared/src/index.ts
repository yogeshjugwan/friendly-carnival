/** Self-declared identity picked on the landing page. */
export type Gender = 'male' | 'female' | 'couple';

/** Video users only meet video users; text-only users only meet text-only users. */
export type ChatMode = 'video' | 'text';

/** Plus-only match filters. 'any' means no filter. */
export interface MatchFilters {
  gender: Gender | 'any';
  /** ISO 3166-1 alpha-2 country code, or 'any'. */
  country: string | 'any';
}

export const NO_FILTERS: MatchFilters = { gender: 'any', country: 'any' };
export const hasFilters = (f: MatchFilters | undefined | null) => !!f && (f.gender !== 'any' || f.country !== 'any');

export interface JoinPayload {
  gender: Gender;
  interests: string[];
  mode: ChatMode;
  /** Don't show my country to partners. */
  hideCountry?: boolean;
  /** Ignored by the server unless the user has Plus. */
  filters?: MatchFilters;
}

export interface PartnerInfo {
  gender: Gender;
  /** ISO 3166-1 alpha-2, or null when unknown or hidden. */
  country: string | null;
  /** The partner chose to hide their country. */
  locationHidden?: boolean;
  /** The partner has Plus. */
  plus?: boolean;
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

/** ICE candidate kinds: host = local network, srflx = public address via STUN, relay = TURN. */
export type CandidateType = 'host' | 'srflx' | 'prflx' | 'relay';

/** Why a call did or didn't connect. No addresses, only candidate kinds and states. */
export interface CallDiagnostics {
  /** Candidate kinds this browser found. */
  local: CandidateType[];
  /** Candidate kinds received from the partner. */
  remote: CandidateType[];
  /** Final RTCPeerConnection.iceConnectionState. */
  ice: string;
  /** For connected calls: the kinds of the pair actually used. */
  path?: [CandidateType, CandidateType];
  /** How the attempt ended. 'relay' = WebRTC failed and video went through the server. */
  outcome: 'connected' | 'timeout' | 'failed' | 'dropped' | 'relay';
}

export interface CallResult {
  matchId: string;
  connected: boolean;
  /** Time from match to connected (or to giving up). */
  ms: number;
  diag?: CallDiagnostics;
}

export interface Stats {
  online: number;
}

export type ReportReason = 'nudity' | 'harassment' | 'underage' | 'scam' | 'illegal' | 'other';
export type ReportSource = 'user' | 'ai';
export const REPORT_REASONS: ReportReason[] = ['nudity', 'harassment', 'underage', 'scam', 'illegal', 'other'];

export interface ReportPayload {
  /** Who is reported: the person on screen now, or the one just skipped. */
  target: 'current' | 'previous';
  reason: ReportReason;
  source: ReportSource;
  note?: string;
  /** Small JPEG data URL of the partner's video. */
  snapshot?: string;
  /** Classifier confidence for AI reports, 0..1. */
  aiScore?: number;
}

export interface BanInfo {
  banId: string;
  reason: string;
  /** ms since epoch, or null for a permanent ban. */
  expiresAt: number | null;
  /** True once an appeal for this ban is waiting for review. */
  appealPending: boolean;
}

export interface ClientToServerEvents {
  'queue:join': (payload: JoinPayload) => void;
  'queue:leave': () => void;
  'call:next': () => void;
  /** Leave the current partner without searching yet (free users watch an ad first, then join). */
  'call:skip': () => void;
  'call:back': () => void;
  'call:result': (result: CallResult) => void;
  'settings:reconnect': (allow: boolean) => void;
  'chat:message': (text: string) => void;
  'chat:typing': (typing: boolean) => void;
  'report:submit': (report: ReportPayload) => void;
  'user:block': (target: 'current' | 'previous') => void;
  'ban:appeal': (message: string) => void;
  /** WebRTC could not connect: switch both sides to video over the server. */
  'relay:start': () => void;
  'relay:chunk': (chunk: RelayChunk) => void;
  signal: (msg: SignalMessage) => void;
  /** Free users out of matches: a rewarded video starts / finished. */
  'limit:ad-start': () => void;
  'limit:ad-done': () => void;
}

export interface ServerToClientEvents {
  'queue:waiting': () => void;
  'match:found': (match: MatchFound) => void;
  'partner:left': (reason: PartnerLeftReason) => void;
  'back:unavailable': (reason: BackUnavailableReason) => void;
  'chat:message': (msg: ChatMessage) => void;
  'chat:typing': (typing: boolean) => void;
  'chat:rejected': (reason: 'rate-limited' | 'invalid') => void;
  'report:received': () => void;
  'report:rejected': (reason: 'no-target' | 'invalid' | 'rate-limited') => void;
  'user:blocked': () => void;
  banned: (ban: BanInfo) => void;
  'ban:appealed': () => void;
  /** Filters were sent without an active Plus subscription and were ignored. */
  'plus:required': () => void;
  /** Matches left today (sent on connect and after each match). */
  'limit:status': (status: MatchLimitStatus) => void;
  /** Today's free matches are used up; the join or Next was not queued. */
  'limit:reached': (status: MatchLimitStatus) => void;
  /** A watched ad added matches. */
  'limit:granted': (status: MatchLimitStatus) => void;
  'limit:ad-rejected': (reason: 'too-soon' | 'no-ads-left' | 'not-started') => void;
  'relay:start': () => void;
  'relay:chunk': (chunk: RelayChunk) => void;
  signal: (msg: SignalMessage) => void;
  stats: (stats: Stats) => void;
  'error:message': (message: string) => void;
}

/** Daily match allowance for free users (Plus is unlimited). */
export interface MatchLimitStatus {
  unlimited: boolean;
  used: number;
  limit: number;
  remaining: number;
  /** Rewarded videos still available today. */
  adsLeft: number;
  /** Matches one watched video adds. */
  adBonus: number;
  /** How long the video must play, in ms. */
  adMs: number;
  /** When the count resets (next midnight UTC), epoch ms. */
  resetsAt: number;
}

export const MAX_INTERESTS = 10;
export const MAX_INTEREST_LENGTH = 24;
export const MAX_MESSAGE_LENGTH = 500;
/** Chat rate limit: at most this many messages per window. */
export const CHAT_BURST = 5;
export const CHAT_WINDOW_MS = 5_000;
export const MAX_REPORT_NOTE_LENGTH = 500;
export const MAX_SNAPSHOT_BYTES = 120_000;
export const MAX_APPEAL_LENGTH = 1_000;

/** Sent in the Socket.IO handshake `auth`. */
export interface HandshakeAuth {
  /** Random per-browser id (UUID v4) kept in localStorage. */
  deviceId?: string;
  /** Session token of a logged-in account. */
  token?: string;
}

/** Preferences saved to an account (or the browser, for guests). */
export interface UserSettings {
  gender: Gender | null;
  interests: string[];
  allowReconnect: boolean;
  hideCountry: boolean;
  /** Plus match filters (kept for everyone, applied only with Plus). */
  filters: MatchFilters;
}

export type PlusPlan = 'week' | 'month' | 'halfyear';
export const PLUS_PLANS: PlusPlan[] = ['week', 'month', 'halfyear'];

export interface PlusStatus {
  active: boolean;
  plan: PlusPlan | null;
  /** End of the paid period (ms since epoch). */
  until: number | null;
  /** Stripe status, or 'admin' for complimentary Plus. */
  status: string | null;
  /** Subscription ends at `until` instead of renewing. */
  cancelAtPeriodEnd: boolean;
}

export interface PlanPrice {
  plan: PlusPlan;
  /** Smallest currency unit (cents, paise). */
  amount: number;
  currency: string;
  interval: 'week' | 'month';
  intervalCount: number;
}

/** What the API returns about the logged-in user. */
export interface PublicUser {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: number;
  settings: UserSettings;
  plus: PlusStatus;
}

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

/** A piece of MediaRecorder output relayed through the server when WebRTC fails. */
export interface RelayChunk {
  /** Increments per chunk; 0 carries the container header. */
  seq: number;
  /** MediaRecorder mime type, e.g. 'video/webm;codecs=vp8,opus'. */
  mime: string;
  data: ArrayBuffer;
}

/** Largest relayed chunk the server forwards. */
export const MAX_RELAY_CHUNK_BYTES = 120_000;
/** Per-user relay budget, bytes per second (≈ 1.5 Mbit/s). */
export const RELAY_BYTES_PER_SECOND = 192_000;
