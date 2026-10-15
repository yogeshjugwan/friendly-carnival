import type { ChatRejectReason, BackUnavailableReason, CallAnswer, ChatMode, MatchFilters, PartnerLeftReason } from '@rc/shared';

export type CallStatus =
  | 'idle' // landing screen
  | 'requesting-media' // waiting on the camera/mic prompt
  | 'media-denied' // user blocked the camera or mic
  | 'searching' // in the match queue
  | 'connecting' // matched, WebRTC negotiating
  | 'in-call' // media flowing (or text chat open)
  | 'limited' // free matches used up for today
  | 'browsing' // Plus: online and picking someone from the Online list
  | 'face-check' // looking for a face in the camera before matching
  | 'no-face' // no face seen: asked to look at the camera
  | 'banned'; // device is banned; can appeal

export interface ChatLine {
  id: number;
  from: 'me' | 'them' | 'system';
  text: string;
  at: number;
}

export interface MediaDeviceOption {
  deviceId: string;
  label: string;
}

/** Give up on a match that has not connected after this long. */
export const CONNECT_TIMEOUT_MS = 15_000;
/** How long a dropped connection may try to recover before we move on. */
export const DISCONNECT_GRACE_MS = 6_000;
/** ICE restarts tried after a live call drops, before moving on to someone new. */
export const MAX_RECONNECTS = 3;
/** Partner video stays blurred this long after connecting. */
export const BLUR_MS = 2_500;
export const TYPING_IDLE_MS = 2_000;
/** On-device nudity screening of the partner's video. */
export const SCREEN_EVERY_MS = 3_000;
export const SCREEN_THRESHOLD = 0.85;
/** Consecutive flagged frames before acting, to avoid one-frame false positives. */
export const SCREEN_HITS = 2;
/** With filters on, offer to widen the search after this long. */
export const FILTER_PATIENCE_MS = 15_000;

export const FORCE_RELAY = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('relay');

export const sameFilters = (a: MatchFilters | undefined, b: MatchFilters | undefined) =>
  (a?.gender ?? 'any') === (b?.gender ?? 'any') &&
  (a?.country ?? 'any') === (b?.country ?? 'any') &&
  !!a?.verifiedOnly === !!b?.verifiedOnly;

export const BACK_TEXT: Record<BackUnavailableReason, string> = {
  'no-previous': 'There is no previous partner to go back to.',
  gone: 'Your previous partner has left randomCall.',
  busy: 'Your previous partner is not available right now.',
  declined: 'Your previous partner has turned off reconnects.',
};

export const LEFT_TEXT: Record<PartnerLeftReason, string> = {
  next: 'Stranger skipped to someone new.',
  stop: 'Stranger stopped chatting.',
  disconnect: 'Stranger disconnected.',
};

export const CALL_ANSWER_TEXT: Record<Extract<CallAnswer, { accepted: false }>['reason'], string> = {
  declined: 'They said no this time. Try someone else!',
  timeout: 'No answer. Try someone else!',
  busy: 'They just started another chat.',
  gone: 'They left before answering.',
};

export type { ChatMode };

/** Why the server refused a chat message, in words. */
export function chatRejectText(reason: ChatRejectReason): string {
  return reason === 'rate-limited'
    ? 'Slow down a little — too many messages.'
    : reason === 'link'
      ? "Links and social handles can't be shared with strangers — add them as a friend first."
      : reason === 'spam'
        ? "You've sent that already."
        : 'That message could not be sent.';
}
