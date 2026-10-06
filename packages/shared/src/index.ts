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
  /** Plus: go online to browse the Online list without being matched at random yet. */
  browse?: boolean;
  /** Topic room (one of TOPICS): matched with the same topic first. */
  topic?: string | null;
}

/** Topic rooms people can pick; matching prefers the same topic. */
export const TOPICS = [
  { id: 'music', label: 'Music', emoji: '🎵' },
  { id: 'gaming', label: 'Gaming', emoji: '🎮' },
  { id: 'movies', label: 'Movies', emoji: '🎬' },
  { id: 'sports', label: 'Sports', emoji: '🏏' },
  { id: 'travel', label: 'Travel', emoji: '✈️' },
  { id: 'language', label: 'Language exchange', emoji: '🗣️' },
  { id: 'study', label: 'Study', emoji: '📚' },
  { id: 'chill', label: 'Just chatting', emoji: '💬' },
] as const;
export type TopicId = (typeof TOPICS)[number]['id'];

export interface PartnerInfo {
  gender: Gender;
  /** ISO 3166-1 alpha-2, or null when unknown or hidden. */
  country: string | null;
  /** The partner chose to hide their country. */
  locationHidden?: boolean;
  /** The partner has Plus. */
  plus?: boolean;
  /** Brand-new account or device: their video starts hidden for you. */
  isNew?: boolean;
  sharedInterests: string[];
  /** Set when you both picked the same topic room. */
  topic?: string | null;
}

/** Someone on the Plus "Online now" list (no names, ids or exact location). */
export interface ActiveUser {
  /** Opaque id for this visit; changes every time they connect. */
  publicId: string;
  gender: Gender;
  /** ISO 3166-1 alpha-2, or null when unknown or hidden. */
  country: string | null;
  locationHidden: boolean;
  interests: string[];
  plus: boolean;
  mode: ChatMode;
  /** 'waiting' people can be called; 'in-call' are busy. */
  state: 'waiting' | 'in-call';
}

/** A Plus member (or a friend) asked to chat with you directly. */
export interface IncomingCall {
  requestId: string;
  from: PartnerInfo;
  /** Set when the caller is your friend: your nickname for them, or '' if none. */
  friend?: string;
  /** Epoch ms after which the request lapses. */
  expiresAt: number;
}

export type CallRequestResult =
  | { ok: true; requestId: string; expiresAt: number }
  | { ok: false; reason: 'plus-required' | 'gone' | 'busy' | 'unavailable' | 'pending' | 'mode' | 'offline' | 'login-required' };

export type CallAnswer = { accepted: true } | { accepted: false; reason: 'declined' | 'timeout' | 'busy' | 'gone' };

export const CALL_REQUEST_MS = 20_000;

/** New-user protection: guests are "new" for this long after their device is first seen… */
export const NEW_DEVICE_MS = 15 * 60_000;
/** …and accounts for this long after sign-up. */
export const NEW_ACCOUNT_MS = 24 * 60 * 60_000;

/** Friend status with the current partner (both must be logged in; both tap ❤️). */
export type FriendState = 'none' | 'requested' | 'they-requested' | 'friends' | 'login-required' | 'partner-guest' | 'full';

/** One of my friends, as I saw them (no emails or account ids). */
export interface Friend {
  /** Opaque handle. */
  id: string;
  nickname: string | null;
  gender: Gender | null;
  country: string | null;
  since: number;
  /** available = in the call screen and free to be called. */
  status: 'available' | 'in-call' | 'online' | 'offline';
}

export const MAX_FRIEND_NICKNAME = 40;

/** Someone you blocked, as you saw them (their device id never leaves the server). */
export interface BlockedUser {
  /** Opaque handle for unblocking. */
  id: string;
  gender: Gender | null;
  country: string | null;
  createdAt: number;
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
  /** Ask to be friends with the current partner (both must tap). */
  'friend:add': () => void;
  'friends:list': (ack: (friends: Friend[] | null) => void) => void;
  'friends:call': (id: string, ack: (result: CallRequestResult) => void) => void;
  'friends:remove': (id: string, ack: (ok: boolean) => void) => void;
  'friends:rename': (id: string, nickname: string, ack: (ok: boolean) => void) => void;
  /** People this device blocked (ack gets the list). */
  'blocks:list': (ack: (blocked: BlockedUser[]) => void) => void;
  /** Unblock one of them. */
  'blocks:remove': (id: string, ack: (ok: boolean) => void) => void;
  /** Coins: send a gift to the partner, buy Boost, or buy matches. */
  'gift:send': (giftId: string, ack: (r: SpendResult) => void) => void;
  'boost:buy': (ack: (r: SpendResult) => void) => void;
  'limit:buy': (ack: (r: SpendResult) => void) => void;
  /** Ask for an icebreaker question (shown to both people). */
  icebreaker: () => void;
  /** Send a reaction emoji to the current partner (one of REACTIONS). */
  reaction: (emoji: string) => void;
  /** Plus: who is online now (ack gets the list, or null without Plus). */
  'users:list': (ack: (users: ActiveUser[] | null) => void) => void;
  /** Plus: ask a waiting person to chat. */
  'users:call': (publicId: string, ack: (result: CallRequestResult) => void) => void;
  'users:cancel': () => void;
  /** Answer an incoming call request. */
  'users:answer': (requestId: string, accept: boolean) => void;
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
  /** Friendship with the current partner changed. */
  'friend:state': (state: FriendState) => void;
  /** My coins and Boost (logged-in users; on connect and after changes). */
  wallet: (wallet: Wallet) => void;
  /** A gift was sent in this chat. */
  gift: (gift: GiftEvent) => void;
  /** An icebreaker question for both people in this chat. */
  icebreaker: (question: string) => void;
  /** The partner sent a reaction. */
  reaction: (emoji: string) => void;
  /** Someone (a Plus member) wants to chat with you. */
  'call:incoming': (call: IncomingCall) => void;
  /** The incoming request was withdrawn or lapsed. */
  'call:incoming-cancelled': (requestId: string) => void;
  /** Your call request was answered (on accept, match:found follows). */
  'call:answered': (answer: CallAnswer) => void;
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

/** Reactions partners can send during a call (✋ = raise hand). */
export const REACTIONS = ['💖', '👍', '🎉', '👏', '😂', '😮', '😢', '🤔', '👎', '✋'] as const;

/** Icebreaker questions: one is shown to both people when either taps 🎲. */
export const ICEBREAKERS = [
  'Would you rather travel to the past or the future?',
  "What's the last song you had on repeat?",
  'If you could live in any country for a year, which one?',
  "What's a food you could eat every day?",
  'Cats or dogs — and why?',
  "What's the best thing that happened to you this week?",
  'If you won the lottery tomorrow, what would you buy first?',
  "What's a movie you can watch again and again?",
  'Would you rather be able to fly or be invisible?',
  "What's something you're really good at?",
  'Beach holiday or mountain trip?',
  "What's the strangest food you've ever tried?",
  'If you could have dinner with anyone, who would it be?',
  "What's your go-to karaoke song?",
  'Morning person or night owl?',
  "What's a hobby you'd love to pick up?",
  'Would you rather speak every language or play every instrument?',
  "What's the best advice you've ever been given?",
  'What would your perfect weekend look like?',
  "What's one thing on your bucket list?",
] as const;

/** Coin packs (one-time Stripe payments; prices in US cents). */
export const COIN_PACKS = [
  { id: 'small', coins: 100, cents: 99, tag: null },
  { id: 'medium', coins: 550, cents: 499, tag: '+10% bonus' },
  { id: 'large', coins: 1200, cents: 999, tag: 'Best value' },
] as const;
export type CoinPackId = (typeof COIN_PACKS)[number]['id'];

/** Gifts sent during a call; the receiver gets GIFT_SHARE of the coins. */
export const GIFTS = [
  { id: 'rose', emoji: '🌹', name: 'Rose', coins: 10 },
  { id: 'heart', emoji: '💖', name: 'Heart', coins: 20 },
  { id: 'gift', emoji: '🎁', name: 'Gift box', coins: 50 },
  { id: 'diamond', emoji: '💎', name: 'Diamond', coins: 100 },
  { id: 'crown', emoji: '👑', name: 'Crown', coins: 200 },
] as const;
export type GiftId = (typeof GIFTS)[number]['id'];
export const GIFT_SHARE = 0.5;

/** Boost: matched first for a while. */
export const BOOST = { coins: 100, minutes: 30 } as const;
/** Out of free matches: spend coins instead of watching a video. */
export const MATCHES_FOR_COINS = { coins: 30, matches: 10 } as const;

/** Coins and Boost of a logged-in user. */
export interface Wallet {
  coins: number;
  /** Epoch ms while Boost is on, else null. */
  boostUntil: number | null;
}

export type SpendResult = { ok: true; wallet: Wallet } | { ok: false; reason: 'login' | 'coins' | 'no-partner' | 'invalid' };

/** A gift shown on both screens. */
export interface GiftEvent {
  giftId: GiftId;
  from: 'me' | 'them';
  /** Coins the receiver got (0 for guests). */
  earned: number;
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
  wallet: Wallet;
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
