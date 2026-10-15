import type { Server, Socket } from 'socket.io';
import type {
  AgeHold,
  BanInfo,
  CallAnswer,
  CallRequestResult,
  ChatMode,
  ClientToServerEvents,
  PartnerLeftReason,
  ServerToClientEvents,
  UserProfile,
  Wallet,
} from '@rc/shared';
import type { AccountStore } from '../accounts.ts';
import type { Analytics } from '../analytics.ts';
import type { AppOptions, CallMetrics } from '../app.ts';
import type { GameStore } from '../games.ts';
import type { Guard } from '../guard.ts';
import type { MatchLimits } from '../limits.ts';
import type { Matchmaker, Pairing, Session } from '../matchmaker.ts';
import type { PushService } from '../push.ts';
import type { Rooms } from '../rooms.ts';
import type { Safety } from '../safety.ts';
import type { SafetyStore } from '../store.ts';
import type { SkipTracker } from '../trust.ts';
import type { TurnCredentials } from '../turn.ts';

export interface SocketData {
  deviceId: string;
  /** Boost end time from the account, at handshake. */
  boostUntil?: number | null;
  /** Logged-in account, from the handshake token. */
  userId: string | null;
  /** Sign-up time of that account. */
  accountCreatedAt?: number | null;
  /** The account has the ✓ Verified badge. */
  verified?: boolean;
  /** No invite reward can be due any more (checked on matches). */
  referralDone?: boolean;
  /** Chatting paused: under 18, or an underage report awaiting ✓ verification. */
  ageHold?: AgeHold;
  /** 0–100; below LOW_TRUST means the shadow pool. */
  trust?: number;
  /** Passed the proof-of-work check (a real browser, not a script). */
  human?: boolean;
  /** The proof-of-work challenge sent to this socket. */
  challenge?: string;
  /** Profile card shown to partners. */
  profile?: UserProfile;
  /** Active Plus subscription at handshake time (updated live by webhooks). */
  plus: boolean;
  ipHash: string | null;
  /** Set while the device or IP is banned; the socket stays connected so it can appeal. */
  ban: BanInfo | null;
  /** Devices blocked by or blocking this device, loaded at handshake. */
  blocked: Set<string>;
  reportsAt: number[];
}

export type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Per-socket report limit: 10 reports per 10 minutes. */
export const REPORT_BURST = 10;
export const REPORT_WINDOW_MS = 10 * 60_000;

export interface CallRequest {
  from: string;
  to: string;
  timer: NodeJS.Timeout;
  friend: boolean;
}

/** Server-wide state and helpers shared by every socket handler module. */
export interface AppContext {
  io: IO;
  opts: AppOptions;
  matchmaker: Matchmaker;
  metrics: CallMetrics;
  relayedMatches: Set<string>;
  store: SafetyStore;
  accounts: AccountStore;
  safety: Safety;
  push: PushService;
  analytics: Analytics;
  guard: Guard;
  limits: MatchLimits | null;
  limitKey: (d: SocketData) => string;
  mayMatch: (socket: { id: string; data: SocketData; emit: IO['emit'] }, mode?: ChatMode) => boolean;
  notifyLeft: (partnerId: string | undefined, reason: PartnerLeftReason) => void;
  announce: (pairing: Pairing) => void;
  pushWallet: (userId: string) => Promise<Wallet | null>;
  refreshTrust: (socketId: string) => Promise<void>;
  isNewUser: (socketId: string) => boolean;
  profileOf: (socketId: string) => { name?: string; avatar?: UserProfile['avatar']; bio?: string; age?: UserProfile['age'] };
  setAgeHold: (userId: string, hold: AgeHold) => void;
  skips: SkipTracker;
  matchStarted: Map<string, number>;
  priorityTimers: Map<string, NodeJS.Timeout>;
  games: GameStore;
  friendMatches: Set<string>;
  friendWants: Map<string, Set<string>>;
  callRequests: Map<string, CallRequest>;
  requestFrom: (socketId: string) => [string, CallRequest] | undefined;
  closeRequest: (requestId: string, answer: CallAnswer | null, tellCallee?: boolean) => void;
  friendHandleFor: (viewer: string, friendId: string) => string;
  rooms: Rooms;
  turn: TurnCredentials;
  socketsByDevice: Map<string, Set<string>>;
}

/** Per-connection values and helpers shared by the handler modules of one socket. */
export interface SocketScope {
  socket: AppSocket;
  /** Identity at handshake. */
  deviceId: string;
  ipHash: string | null;
  userId: string | null;
  /** True (and tells the client) while a ban or age hold is in force. */
  stillBanned: () => boolean;
  /** True (and tells the client) while this person is paused for skipping too fast. */
  pausedForSkipping: () => boolean;
  /** Sliding-window burst limit: true (and records the event) when under `limit` per `windowMs`. */
  underBurst: (times: number[], limit: number, windowMs: number) => boolean;
  /** Sends a direct call request (Online list or Friends list). */
  startRequest: (target: Session, friend: boolean, friendNickname?: string) => CallRequestResult;
}

