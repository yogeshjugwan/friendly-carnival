/** Self-declared identity picked on the landing page. */
export type Gender = 'male' | 'female' | 'couple';

/** Video users only meet video users; text-only users only meet text-only users. */
/** 'voice': microphone only, matched with other voice users. */
export type ChatMode = 'video' | 'voice' | 'text';

/** Plus-only match filters. 'any' means no filter. */
export interface MatchFilters {
  gender: Gender | 'any';
  /** ISO 3166-1 alpha-2 country code, or 'any'. */
  country: string | 'any';
  /** Only people with the ✓ Verified badge. */
  verifiedOnly?: boolean;
}

export const NO_FILTERS: MatchFilters = { gender: 'any', country: 'any' };
export const hasFilters = (f: MatchFilters | undefined | null) =>
  !!f && (f.gender !== 'any' || f.country !== 'any' || !!f.verifiedOnly);

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
  /** Their profile card. */
  name?: string;
  avatar?: string | null;
  bio?: string;
  /** ✓ Verified: a moderator matched their selfie to a live gesture. */
  verified?: boolean;
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
  verified?: boolean;
  name?: string;
  avatar?: string | null;
  bio?: string;
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
  | { ok: false; reason: 'plus-required' | 'gone' | 'busy' | 'unavailable' | 'pending' | 'mode' | 'offline' | 'login-required' | 'cooldown' };

export type CallAnswer = { accepted: true } | { accepted: false; reason: 'declined' | 'timeout' | 'busy' | 'gone' };

export const CALL_REQUEST_MS = 20_000;

/** 'link': links and social handles are blocked with strangers; 'spam': the same text again and again. */
export type ChatRejectReason = 'rate-limited' | 'invalid' | 'link' | 'spam';

/**
 * Proof of work: a real browser spends a fraction of a second finding `nonce`
 * so that sha256(`${challenge}:${nonce}`) starts with `bits` zero bits. Cheap
 * for one person, expensive for a bot farm opening thousands of connections.
 */
export interface GuardChallenge {
  challenge: string;
  bits: number;
}

/** Number of leading zero bits in a hash. */
export function leadingZeroBits(hash: Uint8Array): number {
  let bits = 0;
  for (const byte of hash) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

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
  /** Messages from them you haven't read. */
  unread?: number;
}

/** A message between friends (kept, so it reaches them when they come back). */
export interface DirectMessage {
  id: string;
  fromMe: boolean;
  text: string;
  at: number;
  /** For your own messages: they opened it (✓✓ blue). */
  read?: boolean;
}

/** Someone you chatted with, in your History (ids are opaque per viewer). */
export interface HistoryPerson {
  id: string;
  name: string;
  avatar: string | null;
  gender: Gender | null;
  country: string | null;
  /** Times you were matched. */
  count: number;
  lastAt: number;
  lastMode: ChatMode;
  /** They have an account: you can follow and message them. */
  hasAccount: boolean;
  following: boolean;
  friend: boolean;
  online: boolean;
}

export interface HistoryResult {
  people: HistoryPerson[];
  /** All matches you've had (kept history). */
  total: number;
  /** Matches in the last 7 days. */
  recent: number;
}

/** A conversation in Messages. */
export interface DmThread {
  id: string;
  name: string;
  avatar: string | null;
  lastText: string;
  lastAt: number;
  lastFromMe: boolean;
  unread: number;
  friend: boolean;
  online: boolean;
  /** They wrote first and you haven't replied: a message request. */
  request: boolean;
}

/** Messages to someone who isn't your friend, before they reply. */
export const DM_REQUEST_LIMIT = 3;
export type DmSendResult =
  | { ok: true; message: DirectMessage }
  | { ok: false; reason: 'login-required' | 'not-friends' | 'invalid' | 'wait-reply' };

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
  /** Message a friend (online or not). */
  'dm:send': (friendId: string, text: string, ack: (r: DmSendResult) => void) => void;
  /** The latest messages with a friend (marks theirs as read). */
  'dm:history': (friendId: string, ack: (messages: DirectMessage[] | null) => void) => void;
  /** Your conversations, newest first. */
  'dm:threads': (ack: (threads: DmThread[] | null) => void) => void;
  /** People you chatted with. */
  'history:list': (ack: (r: HistoryResult | null) => void) => void;
  'history:remove': (id: string, ack: (ok: boolean) => void) => void;
  /** One-way follow: you're told when they come online. */
  'follow:set': (id: string, on: boolean, ack: (ok: boolean) => void) => void;
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
  /** Start (or switch to) a mini-game with the current partner. */
  'game:start': (game: GameId) => void;
  'game:move': (move: GameMove) => void;
  'game:end': () => void;
  /** Send a reaction emoji to the current partner (one of REACTIONS). */
  reaction: (emoji: string) => void;
  /** Plus: who is online now (ack gets the list, or null without Plus). */
  'users:list': (ack: (users: ActiveUser[] | null) => void) => void;
  /** Answer to guard:challenge. */
  'guard:proof': (nonce: string) => void;
  /** Spend coins so the next match is a verified person. */
  'match:priority': (ack: (r: SpendResult) => void) => void;
  /** Group rooms: how many people are in each topic's rooms right now. */
  'rooms:list': (ack: (counts: Record<string, number>) => void) => void;
  'room:join': (topic: string, mode: 'video' | 'voice', gender: Gender, ack: (r: RoomJoinResult) => void) => void;
  'room:leave': () => void;
  /** WebRTC signaling to one member of your room. */
  'room:signal': (to: string, msg: SignalMessage) => void;
  'room:chat': (text: string) => void;
  /** Report someone in your room (and leave them behind). */
  'room:report': (memberId: string, reason: ReportReason) => void;
  /** Your profile card (sent before joining, and when it changes). */
  'profile:set': (profile: UserProfile) => void;
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
  'chat:rejected': (reason: ChatRejectReason) => void;
  /** Prove this is a real browser: find a nonce (see GuardChallenge). */
  'guard:challenge': (c: GuardChallenge) => void;
  /** Too many skips / requests: wait before matching again. */
  'guard:slow-down': (s: { reason: 'skipping' | 'flood'; retryAfterMs: number }) => void;
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
  /** A friend you invited (or who invited you) finished their first chat. */
  'referral:rewarded': (reward: ReferralReward) => void;
  /** A gift was sent in this chat. */
  gift: (gift: GiftEvent) => void;
  /** An icebreaker question for both people in this chat. */
  icebreaker: (question: string) => void;
  'room:member-joined': (m: RoomMember) => void;
  'room:member-left': (id: string) => void;
  'room:signal': (s: { from: string; msg: SignalMessage }) => void;
  'room:chat': (c: RoomChat) => void;
  /** No verified person turned up in time: coins refunded. */
  'priority:expired': () => void;
  /** You can't chat right now: under 18, or an age review (verify to continue). */
  'age:hold': (hold: Exclude<AgeHold, null>) => void;
  /** A friend messaged you. */
  'dm:new': (dm: { friendId: string; message: DirectMessage }) => void;
  /** They read your messages (✓✓ turns blue). */
  'dm:read': (friendId: string) => void;
  /** The current mini-game as this person sees it; null when it ended. */
  'game:state': (view: GameView | null) => void;
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
// ---- Group rooms (up to ROOM_SIZE people per topic, logged-in only) ----

export const ROOM_SIZE = 4;

/** Someone else in your room (ids are random per room; nothing identifies the person). */
export interface RoomMember {
  id: string;
  name: string;
  gender: Gender;
  avatar: string | null;
  country: string | null;
  verified: boolean;
}

export type RoomJoinResult =
  | { ok: true; roomId: string; you: string; members: RoomMember[]; iceServers: RTCIceServerLike[]; mode: 'video' | 'voice' }
  | { ok: false; reason: 'login-required' | 'banned' | 'invalid' | 'busy' };

export interface RoomChat {
  from: string;
  text: string;
  at: number;
}

// ---- Mini-games in a call ----

export type GameId = 'ttt' | 'tod' | 'wyr';
export const GAMES: { id: GameId; name: string; emoji: string; blurb: string }[] = [
  { id: 'ttt', name: 'Tic-tac-toe', emoji: '❌', blurb: 'Three in a row wins' },
  { id: 'tod', name: 'Truth or Dare', emoji: '🎲', blurb: 'Take turns — keep it friendly' },
  { id: 'wyr', name: 'Would you rather', emoji: '🤔', blurb: 'Pick one, then see their answer' },
];

export type GameMove = { cell: number } | { pick: 'truth' | 'dare' } | { vote: 'a' | 'b' } | { next: true };

export type GameView =
  | {
      game: 'ttt';
      startedBy: 'me' | 'them';
      /** 9 cells, row by row. */
      board: ('me' | 'them' | null)[];
      myTurn: boolean;
      winner: 'me' | 'them' | 'draw' | null;
      /** Indexes of the winning line. */
      line: number[] | null;
    }
  | {
      game: 'tod';
      startedBy: 'me' | 'them';
      /** Whoever's turn it is picks truth or dare (and answers it). */
      myTurn: boolean;
      card: { kind: 'truth' | 'dare'; text: string; for: 'me' | 'them' } | null;
    }
  | {
      game: 'wyr';
      startedBy: 'me' | 'them';
      question: { a: string; b: string };
      myVote: 'a' | 'b' | null;
      /** Hidden until you vote too. */
      theirVote: 'a' | 'b' | 'hidden' | null;
    };

export const TRUTHS = [
  'What is the most fun thing you did this year?',
  "What's a song you secretly love?",
  "What's the best gift you ever got?",
  'What is your biggest fear?',
  "What's a skill you wish you had?",
  'What was your favourite cartoon as a kid?',
  "What's the weirdest food you have eaten?",
  'Who is your role model and why?',
  "What's something that always makes you laugh?",
  'What is your dream job?',
  "What's the last thing you searched online?",
  'What is a habit you want to break?',
  "What's your most-used emoji?",
  'Where would you live if you could live anywhere?',
  "What's the most embarrassing thing that happened to you at school?",
  'What movie can you watch again and again?',
  "What's one thing people get wrong about you?",
  'What is the best advice you ever got?',
  "What's your guilty-pleasure TV show?",
  'If you won the lottery, what would you buy first?',
] as const;

export const DARES = [
  'Sing the chorus of your favourite song.',
  'Do your best animal impression.',
  'Speak in an accent for the next minute.',
  'Show the last photo in your gallery (if it is safe to share!).',
  'Do 10 jumping jacks.',
  'Say the alphabet backwards as fast as you can.',
  'Make your funniest face and hold it for 5 seconds.',
  'Tell a joke — it has to make them smile.',
  'Talk without closing your lips for 30 seconds.',
  'Dance for 10 seconds with no music.',
  'Describe your day using only three words.',
  'Say a tongue twister three times fast.',
  'Pretend to be a news reporter for 20 seconds.',
  'Balance something on your head until your next turn.',
  'Draw something in the air and let them guess it.',
  'Rap about the room you are in.',
  'Act out your favourite movie scene.',
  'Say something nice in three languages.',
  'Show them the view from your window.',
  'Do your best evil laugh.',
] as const;

export const WOULD_YOU_RATHER: readonly { a: string; b: string }[] = [
  { a: 'Be able to fly', b: 'Be invisible' },
  { a: 'Live by the beach', b: 'Live in the mountains' },
  { a: 'Never use social media again', b: 'Never watch movies again' },
  { a: 'Travel to the past', b: 'Travel to the future' },
  { a: 'Always be 10 minutes late', b: 'Always be 20 minutes early' },
  { a: 'Have unlimited pizza', b: 'Have unlimited biryani' },
  { a: 'Talk to animals', b: 'Speak every language' },
  { a: 'Be famous', b: 'Be rich' },
  { a: 'Read minds', b: 'See the future' },
  { a: 'Only whisper', b: 'Only shout' },
  { a: 'Give up music', b: 'Give up your phone for a month' },
  { a: 'Have a rewind button', b: 'Have a pause button' },
  { a: 'Be a cricket star', b: 'Be a movie star' },
  { a: 'Live without summer', b: 'Live without winter' },
  { a: 'Have a pet dragon', b: 'Have a pet unicorn' },
  { a: 'Eat only sweet food', b: 'Eat only spicy food' },
  { a: 'Explore space', b: 'Explore the deep sea' },
  { a: 'Know how you die', b: 'Know when you die' },
  { a: 'Be the funniest person in the room', b: 'Be the smartest' },
  { a: 'Never feel cold', b: 'Never feel tired' },
  { a: 'Work from home forever', b: 'Work from a beach café' },
  { a: 'Have super strength', b: 'Have super speed' },
  { a: 'Live in a big city', b: 'Live in a small village' },
  { a: 'Lose your phone', b: 'Lose your wallet' },
  { a: 'Be a kid again', b: 'Skip to 10 years from now' },
];

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

// ---- India: Razorpay (UPI, cards, wallets) in rupees ----

/** Coin packs in paise. */
export const INR_COIN_PRICES: Record<CoinPackId, number> = { small: 2_900, medium: 14_900, large: 29_900 };
/** Plus passes: prepaid, no auto-renew. */
export const PLUS_PASSES: readonly { plan: PlusPlan; paise: number; days: number }[] = [
  { plan: 'week', paise: 4_900, days: 7 },
  { plan: 'month', paise: 14_900, days: 30 },
  { plan: 'halfyear', paise: 69_900, days: 182 },
];
/** What can be bought with Razorpay: 'coins:<pack>' or 'plus:<plan>'. */
export type RazorpayProduct = `coins:${CoinPackId}` | `plus:${PlusPlan}`;
export const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/** Gifts sent during a call; the receiver gets GIFT_SHARE of the coins. */
/** A festival window, as month-day ('MM-DD', inclusive; may wrap the new year). */
export interface GiftSeason {
  from: string;
  to: string;
  label: string;
}

export const GIFTS: readonly { id: string; emoji: string; name: string; coins: number; season?: GiftSeason }[] = [
  { id: 'chai', emoji: '☕', name: 'Chai', coins: 5 },
  { id: 'rose', emoji: '🌹', name: 'Rose', coins: 10 },
  { id: 'chocolate', emoji: '🍫', name: 'Chocolate', coins: 15 },
  { id: 'heart', emoji: '💖', name: 'Heart', coins: 20 },
  { id: 'cake', emoji: '🎂', name: 'Cake', coins: 30 },
  { id: 'gift', emoji: '🎁', name: 'Gift box', coins: 50 },
  { id: 'teddy', emoji: '🧸', name: 'Teddy', coins: 75 },
  { id: 'diamond', emoji: '💎', name: 'Diamond', coins: 100 },
  { id: 'crown', emoji: '👑', name: 'Crown', coins: 200 },
  { id: 'car', emoji: '🏎️', name: 'Sports car', coins: 500 },
  // Festival specials
  { id: 'diya', emoji: '🪔', name: 'Diya', coins: 25, season: { from: '10-15', to: '11-20', label: 'Diwali' } },
  { id: 'fireworks', emoji: '🎆', name: 'Fireworks', coins: 60, season: { from: '10-15', to: '11-20', label: 'Diwali' } },
  { id: 'tree', emoji: '🎄', name: 'Christmas tree', coins: 40, season: { from: '12-01', to: '12-31', label: 'Christmas' } },
  { id: 'newyear', emoji: '🥂', name: 'Cheers', coins: 40, season: { from: '12-26', to: '01-07', label: 'New Year' } },
  { id: 'loveletter', emoji: '💌', name: 'Love letter', coins: 35, season: { from: '02-01', to: '02-20', label: "Valentine's" } },
  { id: 'colours', emoji: '🎨', name: 'Holi colours', coins: 30, season: { from: '03-01', to: '03-25', label: 'Holi' } },
  { id: 'kite', emoji: '🪁', name: 'Kite', coins: 20, season: { from: '01-08', to: '01-20', label: 'Makar Sankranti' } },
];
export type GiftId = string;

/** Gifts you can send right now: the regular ones plus festival specials in season (IST dates). */
export function availableGifts(now = Date.now()) {
  const md = new Date(now + 330 * 60_000).toISOString().slice(5, 10);
  const inSeason = (s: GiftSeason) => (s.from <= s.to ? md >= s.from && md <= s.to : md >= s.from || md <= s.to);
  return GIFTS.filter((g) => !g.season || inSeason(g.season));
}
export const GIFT_SHARE = 0.5;

/** ⭐ Priority match: your next match is a ✓ Verified person, ahead of the queue (refunded if none in time). */
export const PRIORITY_MATCH = { coins: 25, waitMinutes: 2 } as const;

/** Boost: matched first for a while. */
export const BOOST = { coins: 100, minutes: 30 } as const;

/** Daily streak: coins for day 1…7 of a streak (then the cycle repeats at day 7's amount). */
export const STREAK_REWARDS = [10, 15, 20, 25, 30, 40, 60] as const;
export const streakReward = (day: number) => STREAK_REWARDS[Math.min(Math.max(day, 1), STREAK_REWARDS.length) - 1]!;

export interface DailyStatus {
  /** Days in a row you claimed, counting today if claimed. */
  streak: number;
  claimedToday: boolean;
  /** Coins the next claim gives. */
  reward: number;
  /** Claiming needs one chat today (and a confirmed email). */
  needsChat: boolean;
  needsEmail: boolean;
}

/**
 * Invite friends: when someone signs up with your link and finishes their first
 * chat, you both get a free Plus day (or coins if you already pay for Plus).
 */
export const REFERRAL = { plusDays: 1, coins: 100, maxRewards: 30 } as const;
/** What a push notification carries (shown by the service worker). */
export interface PushPayload {
  title: string;
  body: string;
  /** Path to open when tapped. */
  url: string;
  /** Same tag replaces an earlier notification instead of stacking. */
  tag?: string;
}

/** A browser push subscription, as PushSubscription.toJSON() gives it. */
export interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export type ReferralReward = { kind: 'plus'; days: number } | { kind: 'coins'; coins: number };
export interface ReferralInfo {
  code: string;
  /** People who signed up with your link. */
  invited: number;
  /** …of whom finished a first chat (each gave you a reward). */
  rewarded: number;
}
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
  /** Profile card shown to partners. */
  name?: string;
  avatar?: string | null;
  bio?: string;
}

/** What partners see about you, besides gender / country / interests. */
export interface UserProfile {
  /** Display name partners see ('' = none). */
  name: string;
  /** One of AVATARS, or null for the default. */
  avatar: string | null;
  /** One line about you (no links or handles). */
  bio: string;
}
export const MAX_BIO = 80;
export const MAX_NAME = 24;
export const AVATARS = [
  '😀', '😎', '🤓', '😇', '🥳', '🤠', '🧐', '😺', '🐶', '🦊', '🐼', '🐨',
  '🦁', '🐯', '🐸', '🐵', '🦄', '🐙', '👻', '🤖', '👽', '🎃', '🌸', '⚡',
] as const;

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
  verification: VerificationStatus;
  /** A free Plus day can still be started (once per account, confirmed email). */
  trialAvailable: boolean;
  /** Date of birth given (asked once before chatting). */
  birthDateSet: boolean;
  /** Gets occasional "people are online" emails. */
  emailsOn: boolean;
  /** Why chatting is on hold: under 18, or an underage report awaiting ✓ verification. */
  ageHold: AgeHold;
}

export const MIN_AGE = 18;
export type AgeHold = 'under-18' | 'review' | null;

/** Whole years between a 'YYYY-MM-DD' birth date and now; null if the date is invalid. */
export function ageFrom(birthDate: string, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  if (y < 1900 || date.getTime() > now.getTime()) return null;
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d)) age--;
  return age;
}

/** Length of the one-time free Plus trial. */
export const PLUS_TRIAL_HOURS = 24;

/** ✓ Verified badge: a selfie with a random gesture, checked by a moderator. */
export type VerificationStatus = 'none' | 'pending' | 'verified' | 'rejected';

export const VERIFY_GESTURES = [
  { id: 'peace', emoji: '✌️', text: 'Make a peace sign next to your face' },
  { id: 'thumbs', emoji: '👍', text: 'Give a thumbs up next to your face' },
  { id: 'palm', emoji: '✋', text: 'Hold an open hand next to your face' },
  { id: 'point', emoji: '☝️', text: 'Point one finger up next to your face' },
  { id: 'ok', emoji: '👌', text: 'Make an OK sign next to your face' },
  { id: 'three', emoji: '🤟', text: 'Hold up three fingers next to your face' },
] as const;
export type VerifyGestureId = (typeof VERIFY_GESTURES)[number]['id'];

/** Largest selfie the server accepts (JPEG data URL length). */
export const MAX_VERIFY_PHOTO = 400_000;

/** A selfie waiting for a moderator (admin API). */
export interface PendingVerification {
  userId: string;
  email: string;
  gesture: VerifyGestureId;
  photo: string;
  createdAt: number;
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
