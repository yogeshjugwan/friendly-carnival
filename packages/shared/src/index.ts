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

export interface CallResult {
  matchId: string;
  connected: boolean;
  /** Time from match to connected (or to giving up). */
  ms: number;
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
  'call:back': () => void;
  'call:result': (result: CallResult) => void;
  'settings:reconnect': (allow: boolean) => void;
  'chat:message': (text: string) => void;
  'chat:typing': (typing: boolean) => void;
  'report:submit': (report: ReportPayload) => void;
  'user:block': (target: 'current' | 'previous') => void;
  'ban:appeal': (message: string) => void;
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
  'report:received': () => void;
  'report:rejected': (reason: 'no-target' | 'invalid' | 'rate-limited') => void;
  'user:blocked': () => void;
  banned: (ban: BanInfo) => void;
  'ban:appealed': () => void;
  /** Filters were sent without an active Plus subscription and were ignored. */
  'plus:required': () => void;
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
