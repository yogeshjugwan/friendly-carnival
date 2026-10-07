'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  hasFilters,
  type BackUnavailableReason,
  type BanInfo,
  type CallDiagnostics,
  type CandidateType,
  type ChatMessage,
  type ChatMode,
  type JoinPayload,
  type MatchFilters,
  type MatchFound,
  type MatchLimitStatus,
  type ActiveUser,
  type CallAnswer,
  type CallRequestResult,
  type IncomingCall,
  type Friend,
  type GiftEvent,
  type SpendResult,
  type Wallet,
  type FriendState,
  type PartnerInfo,
  type PartnerLeftReason,
  type RelayChunk,
  type ReportReason,
  type SignalMessage,
  type ReferralReward,
  type ChatRejectReason,
} from '@rc/shared';
import { ACCOUNT_CHANGED } from './auth';
import { AD_BREAK_MS } from './ads';
import { explicitScore, snapshot } from './nsfw';
import { BackgroundEffect, backgroundEffectsSupported, type BackgroundMode } from './backgroundEffect';
import { RelayReceiver, RelaySender, relaySupported } from './relay';
import { faceVisible, waitForFace } from './faceCheck';
import { GAM_REWARDED_UNIT, showRewardedAd } from './rewardedAd';
import { loadSettings, onSettingsChange } from './settings';
import { getSocket } from './socket';

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
const CONNECT_TIMEOUT_MS = 15_000;
/** How long a dropped connection may try to recover before we move on. */
const DISCONNECT_GRACE_MS = 6_000;
/** Partner video stays blurred this long after connecting. */
const BLUR_MS = 2_500;
const TYPING_IDLE_MS = 2_000;
/** On-device nudity screening of the partner's video. */
const SCREEN_EVERY_MS = 3_000;
const SCREEN_THRESHOLD = 0.85;
/** Consecutive flagged frames before acting, to avoid one-frame false positives. */
const SCREEN_HITS = 2;
/** With filters on, offer to widen the search after this long. */
const FILTER_PATIENCE_MS = 15_000;

const FORCE_RELAY = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('relay');

const sameFilters = (a: MatchFilters | undefined, b: MatchFilters | undefined) =>
  (a?.gender ?? 'any') === (b?.gender ?? 'any') &&
  (a?.country ?? 'any') === (b?.country ?? 'any') &&
  !!a?.verifiedOnly === !!b?.verifiedOnly;

const BACK_TEXT: Record<BackUnavailableReason, string> = {
  'no-previous': 'There is no previous partner to go back to.',
  gone: 'Your previous partner has left randomCall.',
  busy: 'Your previous partner is not available right now.',
  declined: 'Your previous partner has turned off reconnects.',
};

const LEFT_TEXT: Record<PartnerLeftReason, string> = {
  next: 'Stranger skipped to someone new.',
  stop: 'Stranger stopped chatting.',
  disconnect: 'Stranger disconnected.',
};

export function useRandomCall() {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [mode, setMode] = useState<ChatMode>('video');
  const [online, setOnline] = useState<number | null>(null);
  const [partner, setPartner] = useState<PartnerInfo | null>(null);
  const [lastLeftReason, setLastLeftReason] = useState<PartnerLeftReason | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [blurPartner, setBlurPartner] = useState(false);
  const [messages, setMessages] = useState<ChatLine[]>([]);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [allowReconnect, setAllowReconnectState] = useState(true);
  const [cameras, setCameras] = useState<MediaDeviceOption[]>([]);
  const [mics, setMics] = useState<MediaDeviceOption[]>([]);
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [micId, setMicId] = useState<string | null>(null);
  const [ban, setBan] = useState<BanInfo | null>(null);
  /** The user chose to hide the partner's video. */
  const [partnerHidden, setPartnerHidden] = useState(false);
  /** Screening flagged the partner's video; it stays blurred for this match. */
  const [aiHidden, setAiHidden] = useState(false);
  /** An ad is covering the partner tile between strangers. */
  const [adBreak, setAdBreak] = useState(false);
  /** Free-user daily allowance, from the server. */
  const [limit, setLimit] = useState<MatchLimitStatus | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  /** A rewarded video is playing; matches are added when it ends. */
  const [rewardAd, setRewardAd] = useState<{ endsAt: number } | null>(null);
  /** Emoji reactions floating over the video (mine and the partner's). */
  const [reactions, setReactions] = useState<{ id: number; emoji: string; mine: boolean; x: number }[]>([]);
  const reactionId = useRef(0);
  const showReaction = useCallback((emoji: string, mine: boolean) => {
    const id = ++reactionId.current;
    // Mine float up on the right, the partner's on the left.
    const x = (mine ? 60 : 12) + Math.random() * 25;
    setReactions((r) => [...r.slice(-11), { id, emoji, mine, x }]);
    window.setTimeout(() => setReactions((r) => r.filter((e) => e.id !== id)), 2_600);
  }, []);
  /** Coins and Boost (logged-in users), pushed by the server. */
  const [wallet, setWallet] = useState<Wallet | null>(null);
  /** Gift animations on screen. */
  const [gifts, setGifts] = useState<(GiftEvent & { id: number })[]>([]);
  const giftId = useRef(0);
  /** Face check: what start() was asked to do, to retry after "no face". */
  const pendingStart = useRef<{ join: Omit<JoinPayload, 'mode' | 'hideCountry'>; chatMode: ChatMode; browse: false | 'online' | 'friends' } | null>(null);
  /** In a call, the camera hasn't seen a face for a while. */
  const [noFace, setNoFace] = useState(false);
  /** Icebreaker question on screen for both people. */
  const [icebreaker, setIcebreaker] = useState<{ text: string; at: number } | null>(null);
  /** Friendship with the current partner (❤️ Add friend). */
  const [friendState, setFriendState] = useState<FriendState>('none');
  /** What "browse" was opened for: the Plus Online list or the Friends list. */
  const [browseFor, setBrowseFor] = useState<'online' | 'friends' | null>(null);
  /** A Plus member asked to chat with this user. */
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  /** This (Plus) user's open request from the Online list. */
  const [outgoingCall, setOutgoingCall] = useState<{ publicId: string; expiresAt: number } | null>(null);
  /** Changes on every ad break so ad slots load a fresh ad. */
  const [adKey, setAdKey] = useState(0);
  /** The server ignored our filters because we don't have Plus. */
  const [plusRequired, setPlusRequired] = useState(false);
  /** Searching with filters has taken a while. */
  const [searchingLong, setSearchingLong] = useState(false);
  /** Whether the current search uses filters (restarts the patience timer when it changes). */
  const [filtering, setFiltering] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const joinRef = useRef<JoinPayload | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const activeRef = useRef(false);
  const matchRef = useRef<{ id: string; startedAt: number; reported: boolean } | null>(null);
  /** Socket.IO video fallback for this match, when WebRTC could not connect. */
  const relay = useRef<{ sender?: RelaySender; receiver?: RelayReceiver; active: boolean }>({ active: false });
  const [relayActive, setRelayActive] = useState(false);
  /** Candidate kinds seen in the current attempt, for diagnostics. */
  const candidates = useRef<{ local: Set<CandidateType>; remote: Set<CandidateType> }>({ local: new Set(), remote: new Set() });
  const timers = useRef<{
    connect?: number;
    disconnect?: number;
    blur?: number;
    typing?: number;
    notice?: number;
    ad?: number;
    patience?: number;
    reward?: number;
    icebreaker?: number;
    slowDown?: number;
  }>({});
  /** Plus members see no ads. */
  const adFreeRef = useRef(false);
  const lineId = useRef(0);
  const typingSent = useRef(false);
  const partnerVideoRef = useRef<HTMLVideoElement | null>(null);
  /** Latest frame of the current partner, and of the one before, for reports. */
  const snapshots = useRef<{ current?: string; previous?: string }>({});
  const aiReported = useRef(false);

  const clearTimer = (key: keyof typeof timers.current) => {
    window.clearTimeout(timers.current[key]);
    timers.current[key] = undefined;
  };

  const addLine = useCallback((from: ChatLine['from'], text: string, at = Date.now()) => {
    setMessages((m) => [...m.slice(-199), { id: ++lineId.current, from, text, at }]);
  }, []);

  const flash = useCallback((text: string) => {
    setNotice(text);
    window.clearTimeout(timers.current.notice);
    timers.current.notice = window.setTimeout(() => setNotice(null), 4_000);
  }, []);

  /**
   * Show an ad in the partner tile for AD_BREAK_MS. With `then`, free users see
   * the whole ad before `then` runs (e.g. joining the queue); Plus members skip
   * the ad and `then` runs at once. Without it, the ad just covers the tile.
   */
  const startAdBreak = useCallback((then?: () => void) => {
    if (AD_BREAK_MS <= 0 || adFreeRef.current) return then?.();
    setAdKey((k) => k + 1);
    setAdBreak(true);
    window.clearTimeout(timers.current.ad);
    timers.current.ad = window.setTimeout(() => {
      setAdBreak(false);
      if (then && activeRef.current) then();
    }, AD_BREAK_MS);
  }, []);

  /** True when the next search waits for an ad (free users with ads on). */
  const adFirst = () => AD_BREAK_MS > 0 && !adFreeRef.current;

  const reportResult = useCallback((connected: boolean, outcome: CallDiagnostics['outcome']) => {
    const match = matchRef.current;
    if (!match || match.reported) return;
    match.reported = true;
    const pc = pcRef.current;
    const ms = Date.now() - match.startedAt;
    const diag: CallDiagnostics = {
      local: [...candidates.current.local],
      remote: [...candidates.current.remote],
      ice: pc?.iceConnectionState ?? 'closed',
      outcome,
    };
    const send = () => getSocket().emit('call:result', { matchId: match.id, connected, ms, diag });
    if (!connected || !pc) return send();
    // Which path did the call actually take (direct, via STUN, or via TURN relay)?
    void selectedPath(pc)
      .then((path) => {
        if (path) diag.path = path;
      })
      .finally(send);
  }, []);

  const closePeer = useCallback(() => {
    relay.current.sender?.stop();
    relay.current.receiver?.stop();
    relay.current = { active: false };
    setRelayActive(false);
    matchRef.current = null;
    clearTimer('connect');
    clearTimer('disconnect');
    clearTimer('blur');
    const pc = pcRef.current;
    pcRef.current = null;
    pendingIce.current = [];
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
    }
    if (snapshots.current.current) snapshots.current = { previous: snapshots.current.current };
    aiReported.current = false;
    setRemoteStream(null);
    setPartner(null);
    setPartnerTyping(false);
    setBlurPartner(false);
    setPartnerHidden(false);
    setAiHidden(false);
    typingSent.current = false;
  }, []);

  const requeue = useCallback(() => {
    if (!activeRef.current || !joinRef.current) return;
    setStatus('searching');
    getSocket().emit('queue:join', joinRef.current);
  }, []);

  const next = useCallback(() => {
    if (!activeRef.current) return;
    if (pcRef.current || matchRef.current) setHasPrevious(true);
    closePeer();
    setLastLeftReason(null);
    setMessages([]);
    setStatus('searching');
    if (!adFirst()) return void getSocket().emit('call:next');
    // Free users: leave the partner now, watch the ad, then start searching.
    getSocket().emit('call:skip');
    startAdBreak(() => joinRef.current && getSocket().emit('queue:join', joinRef.current));
  }, [closePeer, startAdBreak]);

  const back = useCallback(() => {
    if (!activeRef.current) return;
    getSocket().emit('call:back');
  }, []);

  const markConnected = useCallback(() => {
    clearTimer('connect');
    clearTimer('disconnect');
    setStatus('in-call');
    reportResult(true, 'connected');
    setBlurPartner(true);
    timers.current.blur = window.setTimeout(() => setBlurPartner(false), BLUR_MS);
  }, [reportResult]);

  /** Switch this match to video over the server (both sides call this). */
  const startRelay = useCallback(() => {
    const local = localRef.current;
    if (relay.current.active || !matchRef.current || !local) return;
    relay.current.active = true;
    clearTimer('connect');
    clearTimer('disconnect');
    // Stop the failed WebRTC attempt; the match itself continues.
    const pc = pcRef.current;
    pcRef.current = null;
    if (pc) {
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.close();
    }
    const socket = getSocket();
    socket.emit('relay:start');
    const sender = new RelaySender(local, (chunk) => socket.emit('relay:chunk', chunk));
    if (!sender.start()) flash('This browser cannot send video through the relay. Text chat still works.');
    relay.current.sender = sender;
    setRelayActive(true);
    setStatus('in-call');
    setBlurPartner(true);
    timers.current.blur = window.setTimeout(() => setBlurPartner(false), BLUR_MS);
  }, [flash]);

  const startPeer = useCallback(
    async (match: MatchFound) => {
      const local = localRef.current;
      if (!local) return;

      const socket = getSocket();
      const pc = new RTCPeerConnection({ iceServers: match.iceServers });
      // No direct or relayed path (or it dropped for good): count it, then move on.
      const giveUp = (outcome: CallDiagnostics['outcome']) => {
        reportResult(false, outcome);
        // Strict networks block direct video: send it through the server instead.
        if (relaySupported() && activeRef.current) startRelay();
        else next();
      };
      candidates.current = { local: new Set(), remote: new Set() };
      pcRef.current = pc;
      // ?relay=1 forces the fallback (testing).
      if (FORCE_RELAY && relaySupported()) {
        startRelay();
        return;
      }
      setStatus('connecting');

      local.getTracks().forEach((track) => pc.addTrack(track, local));

      const remote = new MediaStream();
      setRemoteStream(remote);
      pc.ontrack = (event) => {
        const tracks = event.streams[0]?.getTracks() ?? [event.track];
        tracks.forEach((t) => {
          if (!remote.getTracks().includes(t)) remote.addTrack(t);
        });
      };

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        const type = candidateType(event.candidate.candidate);
        if (type) candidates.current.local.add(type);
        socket.emit('signal', { kind: 'ice', candidate: event.candidate.toJSON() });
      };

      pc.onconnectionstatechange = () => {
        if (pcRef.current !== pc) return;
        const state = pc.connectionState;
        if (state === 'connected') markConnected();
        else if (state === 'failed') giveUp('failed');
        else if (state === 'disconnected') {
          // Often recovers on its own (network blip); give it a moment first.
          clearTimer('disconnect');
          timers.current.disconnect = window.setTimeout(() => {
            if (pcRef.current === pc && pc.connectionState !== 'connected') giveUp('dropped');
          }, DISCONNECT_GRACE_MS);
        }
      };

      timers.current.connect = window.setTimeout(() => {
        if (pcRef.current === pc && pc.connectionState !== 'connected') giveUp('timeout');
      }, CONNECT_TIMEOUT_MS);

      if (match.initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('signal', { kind: 'offer', sdp: offer.sdp ?? '' });
      }
    },
    [markConnected, next, reportResult, startRelay],
  );

  const handleSignal = useCallback(async (msg: SignalMessage) => {
    const pc = pcRef.current;
    if (!pc) return;
    const socket = getSocket();

    if (msg.kind === 'offer') {
      await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', { kind: 'answer', sdp: answer.sdp ?? '' });
    } else if (msg.kind === 'answer') {
      await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
    } else {
      const candidate = msg.candidate as RTCIceCandidateInit;
      const type = candidateType(candidate.candidate ?? '');
      if (type) candidates.current.remote.add(type);
      if (!pc.remoteDescription) {
        pendingIce.current.push(candidate);
        return;
      }
      await pc.addIceCandidate(candidate).catch(() => undefined);
      return;
    }

    // Remote description is now set: flush candidates that arrived early.
    const queued = pendingIce.current;
    pendingIce.current = [];
    for (const c of queued) await pc.addIceCandidate(c).catch(() => undefined);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const onStats = ({ online }: { online: number }) => setOnline(online);
    const onMatch = (match: MatchFound) => {
      // A new partner ends any open call request either way.
      setOutgoingCall(null);
      setIncomingCall(null);
      setFriendState('none');
      setIcebreaker(null);
      if (pcRef.current || matchRef.current) setHasPrevious(true);
      closePeer();
      matchRef.current = { id: match.matchId, startedAt: Date.now(), reported: false };
      setPartner(match.partner);
      // New-user protection: a brand-new account's video starts hidden.
      if (match.partner.isNew && match.mode === 'video') setPartnerHidden(true);
      setLastLeftReason(null);
      setMessages([]);
      // Every change of partner shows a fresh ad; Start/Next/partner-left start it
      // earlier, Back only once the reconnect actually happened.
      if (match.reconnected) startAdBreak();
      addLine(
        'system',
        match.reconnected ? "You're back with your previous partner." : "You're now chatting with a random stranger. Say hi!",
      );
      if (match.mode === 'text') setStatus('in-call');
      else void startPeer(match).catch((e) => console.warn('[webrtc]', e));
    };
    const onSignal = (msg: SignalMessage) => void handleSignal(msg).catch((e) => console.warn('[signal]', e));
    const onLeft = (reason: PartnerLeftReason) => {
      setHasPrevious(true);
      closePeer();
      setLastLeftReason(reason);
      addLine('system', LEFT_TEXT[reason]);
      setStatus('searching');
      startAdBreak(requeue);
    };
    const onBackUnavailable = (reason: BackUnavailableReason) => flash(BACK_TEXT[reason]);
    const onChat = (msg: ChatMessage) => {
      setPartnerTyping(false);
      addLine('them', msg.text, msg.at);
    };
    const onTyping = (typing: boolean) => setPartnerTyping(typing);
    const onRejected = (reason: ChatRejectReason) =>
      flash(
        reason === 'rate-limited'
          ? 'Slow down a little — too many messages.'
          : reason === 'link'
            ? "Links and social handles can't be shared with strangers — add them as a friend first."
            : reason === 'spam'
              ? "You've sent that already."
              : 'That message could not be sent.',
      );
    const onSlowDown = ({ reason, retryAfterMs }: { reason: 'skipping' | 'flood'; retryAfterMs: number }) => {
      const secs = Math.ceil(retryAfterMs / 1000);
      if (reason === 'flood') {
        activeRef.current = false;
        setStatus('idle');
        flash(`Too many requests from this browser. Try again in ${Math.ceil(secs / 60)} min.`);
        return;
      }
      flash(`You're skipping very fast — take a breath. Matching resumes in ${secs} s.`);
      window.clearTimeout(timers.current.slowDown);
      timers.current.slowDown = window.setTimeout(() => requeue(), retryAfterMs + 500);
    };
    const onError = (message: string) => console.warn('[server]', message);
    const onBanned = (info: BanInfo) => {
      activeRef.current = false;
      closePeer();
      setMessages([]);
      setBan(info);
      setStatus('banned');
    };
    const onReported = () => flash('Thanks — your report was sent. Our team will review it.');
    const onReportRejected = (reason: 'no-target' | 'invalid' | 'rate-limited') =>
      flash(
        reason === 'no-target'
          ? 'There is no one to report right now.'
          : reason === 'rate-limited'
            ? 'You have sent a lot of reports. Please wait a few minutes.'
            : 'The report could not be sent.',
      );
    const onBlocked = () => flash('Blocked. You will not be matched with them again.');
    const onPlusRequired = () => setPlusRequired(true);
    const onReaction = (emoji: string) => showReaction(emoji, false);
    const onWallet = (w: Wallet) => setWallet(w);
    const onReferral = (r: ReferralReward) => {
      addLine(
        'system',
        r.kind === 'plus'
          ? `🎁 Invite reward: you got ${r.days} free day${r.days > 1 ? 's' : ''} of Plus!`
          : `🎁 Invite reward: you got ${r.coins} coins!`,
      );
      // Let the account (Plus perks, coins) refresh everywhere.
      window.dispatchEvent(new Event(ACCOUNT_CHANGED));
    };
    const onGift = (g: GiftEvent) => {
      const id = ++giftId.current;
      setGifts((list) => [...list.slice(-3), { ...g, id }]);
      window.setTimeout(() => setGifts((list) => list.filter((x) => x.id !== id)), 3_500);
    };
    const onIcebreaker = (q: string) => {
      setIcebreaker({ text: q, at: Date.now() });
      addLine('system', `🎲 ${q}`);
      window.clearTimeout(timers.current.icebreaker);
      timers.current.icebreaker = window.setTimeout(() => setIcebreaker(null), 10_000);
    };
    const onFriendState = (st: FriendState) => setFriendState(st);
    const onIncomingCall = (c: IncomingCall) => setIncomingCall(c);
    const onIncomingCancelled = (id: string) => setIncomingCall((c) => (c?.requestId === id ? null : c));
    const onCallAnswered = (a: CallAnswer) => {
      setOutgoingCall(null);
      if (!a.accepted) flash(CALL_ANSWER_TEXT[a.reason]);
      // Accepted: match:found follows and switches the call over.
    };
    const onLimitStatus = (st: MatchLimitStatus) => setLimit(st);
    const onLimitReached = (st: MatchLimitStatus) => {
      setLimit(st);
      setLimitReached(true);
      window.clearTimeout(timers.current.ad);
      setAdBreak(false);
      setStatus('limited');
    };
    const onLimitGranted = (st: MatchLimitStatus) => {
      setLimit(st);
      setLimitReached(false);
      setRewardAd(null);
      flash(`+${st.adBonus} matches unlocked. Enjoy!`);
      requeue();
    };
    const onAdRejected = (reason: 'too-soon' | 'no-ads-left' | 'not-started') => {
      setRewardAd(null);
      flash(reason === 'no-ads-left' ? 'No more videos today. Try Plus for unlimited matches.' : 'Please watch the whole video to unlock matches.');
    };
    const onRelayStart = () => startRelay();
    const onRelayChunk = (chunk: RelayChunk) => {
      if (!relay.current.active) startRelay();
      const video = partnerVideoRef.current;
      if (!video) return;
      relay.current.receiver ??= new RelayReceiver(video, () =>
        flash('This browser cannot play the relayed video. Try Chrome, or chat by text.'),
      );
      relay.current.receiver.push(chunk);
    };

    socket.on('stats', onStats);
    socket.on('match:found', onMatch);
    socket.on('signal', onSignal);
    socket.on('partner:left', onLeft);
    socket.on('back:unavailable', onBackUnavailable);
    socket.on('chat:message', onChat);
    socket.on('chat:typing', onTyping);
    socket.on('chat:rejected', onRejected);
    socket.on('guard:slow-down', onSlowDown);
    socket.on('error:message', onError);
    socket.on('banned', onBanned);
    socket.on('report:received', onReported);
    socket.on('report:rejected', onReportRejected);
    socket.on('user:blocked', onBlocked);
    socket.on('plus:required', onPlusRequired);
    socket.on('relay:start', onRelayStart);
    socket.on('relay:chunk', onRelayChunk);
    socket.on('reaction', onReaction);
    socket.on('wallet', onWallet);
    socket.on('referral:rewarded', onReferral);
    socket.on('gift', onGift);
    socket.on('icebreaker', onIcebreaker);
    socket.on('friend:state', onFriendState);
    socket.on('call:incoming', onIncomingCall);
    socket.on('call:incoming-cancelled', onIncomingCancelled);
    socket.on('call:answered', onCallAnswered);
    socket.on('limit:status', onLimitStatus);
    socket.on('limit:reached', onLimitReached);
    socket.on('limit:granted', onLimitGranted);
    socket.on('limit:ad-rejected', onAdRejected);
    return () => {
      socket.off('reaction', onReaction);
      socket.off('wallet', onWallet);
      socket.off('referral:rewarded', onReferral);
      socket.off('gift', onGift);
      socket.off('icebreaker', onIcebreaker);
      socket.off('friend:state', onFriendState);
      socket.off('call:incoming', onIncomingCall);
      socket.off('call:incoming-cancelled', onIncomingCancelled);
      socket.off('call:answered', onCallAnswered);
      socket.off('limit:status', onLimitStatus);
      socket.off('limit:reached', onLimitReached);
      socket.off('limit:granted', onLimitGranted);
      socket.off('limit:ad-rejected', onAdRejected);
      socket.off('stats', onStats);
      socket.off('match:found', onMatch);
      socket.off('signal', onSignal);
      socket.off('partner:left', onLeft);
      socket.off('back:unavailable', onBackUnavailable);
      socket.off('chat:message', onChat);
      socket.off('chat:typing', onTyping);
      socket.off('chat:rejected', onRejected);
      socket.off('guard:slow-down', onSlowDown);
      socket.off('error:message', onError);
      socket.off('banned', onBanned);
      socket.off('report:received', onReported);
      socket.off('report:rejected', onReportRejected);
      socket.off('user:blocked', onBlocked);
      socket.off('plus:required', onPlusRequired);
      socket.off('relay:start', onRelayStart);
      socket.off('relay:chunk', onRelayChunk);
    };
  }, [startPeer, handleSignal, closePeer, requeue, addLine, flash, startAdBreak, startRelay, showReaction]);

  // Keep the server in sync with the "allow reconnect" setting (and on every reconnect).
  useEffect(() => {
    const socket = getSocket();
    const sync = () => {
      const allow = loadSettings().allowReconnect;
      setAllowReconnectState(allow);
      socket.emit('settings:reconnect', allow);
    };
    sync();
    socket.on('connect', sync);
    const off = onSettingsChange(sync);
    return () => {
      socket.off('connect', sync);
      off();
    };
  }, []);

  const refreshDevices = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    const pick = (kind: MediaDeviceKind, fallback: string) =>
      devices
        .filter((d) => d.kind === kind && d.deviceId)
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${fallback} ${i + 1}` }));
    setCameras(pick('videoinput', 'Camera'));
    setMics(pick('audioinput', 'Microphone'));
  }, []);

  /** Background effect (blur / virtual background) and the real camera track behind it. */
  /** Hidden video used to float my own camera when nobody else is on screen. */
  const selfPipRef = useRef<HTMLVideoElement | null>(null);
  const effectRef = useRef<BackgroundEffect | null>(null);
  const rawCameraRef = useRef<MediaStreamTrack | null>(null);
  const [background, setBackgroundState] = useState<BackgroundMode>('none');
  const [backgroundBusy, setBackgroundBusy] = useState(false);

  const adoptStream = useCallback((stream: MediaStream) => {
    localRef.current = stream;
    setLocalStream(stream);
    // With an effect on, the stream's video is a canvas; the device is the real camera behind it.
    setCameraId((rawCameraRef.current ?? stream.getVideoTracks()[0])?.getSettings().deviceId ?? null);
    setMicId(stream.getAudioTracks()[0]?.getSettings().deviceId ?? null);
  }, []);

  /** Puts `track` in place of the current outgoing/preview video track. */
  const swapVideoTrack = useCallback(
    async (track: MediaStreamTrack) => {
      const local = localRef.current;
      if (!local) return;
      const current = local.getVideoTracks()[0];
      track.enabled = current ? current.enabled : true;
      const sender = pcRef.current?.getSenders().find((x) => x.track?.kind === 'video');
      await sender?.replaceTrack(track).catch(() => undefined);
      adoptStream(new MediaStream([track, ...local.getAudioTracks()]));
    },
    [adoptStream],
  );

  /** Backgrounds and effects: blur or replace the background of my camera. */
  const setBackground = useCallback(
    async (mode: BackgroundMode) => {
      const local = localRef.current;
      try {
        window.localStorage.setItem('rc.background', mode);
      } catch {
        /* ignore */
      }
      if (!local || !local.getVideoTracks()[0]) return setBackgroundState(mode);
      if (mode === 'none') {
        const raw = rawCameraRef.current;
        effectRef.current?.stop();
        effectRef.current = null;
        rawCameraRef.current = null;
        if (raw) await swapVideoTrack(raw);
        return setBackgroundState('none');
      }
      if (effectRef.current) {
        effectRef.current.setMode(mode);
        return setBackgroundState(mode);
      }
      if (!backgroundEffectsSupported()) return flash('Backgrounds and effects are not supported in this browser.');
      setBackgroundBusy(true);
      const raw = local.getVideoTracks()[0];
      const effect = new BackgroundEffect(mode);
      try {
        const processed = await effect.start(raw);
        effectRef.current = effect;
        rawCameraRef.current = raw;
        await swapVideoTrack(processed);
        setBackgroundState(mode);
      } catch {
        effect.stop();
        flash('Could not load backgrounds and effects on this device.');
      } finally {
        setBackgroundBusy(false);
      }
    },
    [flash, swapVideoTrack],
  );

  const start = useCallback(
    async (join: Omit<JoinPayload, 'mode' | 'hideCountry'>, chatMode: ChatMode = 'video', browse: false | 'online' | 'friends' = false) => {
      const saved = loadSettings();
      const payload: JoinPayload = { ...join, mode: chatMode, hideCountry: saved.hideCountry, filters: saved.filters };
      setFiltering(hasFilters(saved.filters));
      joinRef.current = payload;
      setMode(chatMode);
      setLastLeftReason(null);
      setMessages([]);
      setHasPrevious(false);

      // Switching between video and voice: start over with the right devices.
      const wantVideo = chatMode === 'video';
      const current = localRef.current;
      if (current && chatMode !== 'text' && current.getVideoTracks().length > 0 !== wantVideo) {
        effectRef.current?.stop();
        effectRef.current = null;
        rawCameraRef.current?.stop();
        rawCameraRef.current = null;
        current.getTracks().forEach((t) => t.stop());
        localRef.current = null;
        setLocalStream(null);
      }

      if (chatMode !== 'text' && !localRef.current) {
        setStatus('requesting-media');
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: wantVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          adoptStream(stream);
          setCameraOn(wantVideo);
          setMicOn(true);
          void refreshDevices();
          // Bring back the background the user picked last time.
          let saved: BackgroundMode = 'none';
          try {
            saved = (window.localStorage.getItem('rc.background') as BackgroundMode | null) ?? 'none';
          } catch {
            /* ignore */
          }
          if (wantVideo && saved !== 'none') void setBackground(saved);
        } catch {
          setStatus('media-denied');
          return;
        }
      }

      // Safety: video chats need a face in the camera (checked on this device).
      const local = localRef.current;
      if (chatMode === 'video' && local && local.getVideoTracks()[0]?.enabled) {
        setStatus('face-check');
        const cam = rawCameraRef.current ? new MediaStream([rawCameraRef.current]) : local;
        const seen = await waitForFace(cam, 6_000);
        if (seen === false) {
          pendingStart.current = { join, chatMode, browse };
          setStatus('no-face');
          return;
        }
      }

      activeRef.current = true;
      setBrowseFor(browse || null);
      if (browse) {
        // Online for direct calls (Plus Online list, or friends), but not in the random queue until Next.
        setStatus('browsing');
        getSocket().emit('queue:join', { ...payload, browse: true });
        return;
      }
      setStatus('searching');
      startAdBreak(() => getSocket().emit('queue:join', payload));
    },
    [adoptStream, refreshDevices, startAdBreak, setBackground],
  );

  /** "No face" screen: check again and carry on. */
  const retryFaceCheck = useCallback(() => {
    const p = pendingStart.current;
    if (p) void start(p.join, p.chatMode, p.browse);
  }, [start]);

  // During video calls, remind people whose face hasn't been visible for ~9 s.
  useEffect(() => {
    if (mode !== 'video' || !cameraOn || !(status === 'in-call' || status === 'connecting' || status === 'searching' || status === 'browsing')) {
      setNoFace(false);
      return;
    }
    let misses = 0;
    let cancelled = false;
    const t = window.setInterval(async () => {
      const raw = rawCameraRef.current;
      const cam = raw ? new MediaStream([raw]) : localRef.current;
      if (!cam) return;
      const seen = await faceVisible(cam);
      if (cancelled || seen === null) return;
      misses = seen ? 0 : misses + 1;
      setNoFace(misses >= 3);
    }, 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [mode, cameraOn, status]);

  const stop = useCallback(() => {
    activeRef.current = false;
    window.clearTimeout(timers.current.ad);
    setAdBreak(false);
    closePeer();
    setMessages([]);
    setHasPrevious(false);
    getSocket().emit('queue:leave');
    window.clearTimeout(timers.current.reward);
    setRewardAd(null);
    setLimitReached(false);
    setStatus('idle');
  }, [closePeer]);

  /** Plays a rewarded video; the server adds matches if it ran the full time. */
  /** Sends a reaction to the partner and shows it here too. */
  const sendReaction = useCallback(
    (emoji: string) => {
      if (!matchRef.current) return;
      getSocket().emit('reaction', emoji);
      showReaction(emoji, true);
    },
    [showReaction],
  );

  const ask = (event: 'boost:buy' | 'limit:buy') =>
    new Promise<SpendResult>((resolve) =>
      getSocket()
        .timeout(8_000)
        .emit(event, (err, r) => resolve(err ? { ok: false, reason: 'invalid' } : r)),
    );

  /** 🎁 Send a gift to the current partner. */
  const sendGift = useCallback(
    (id: string) =>
      new Promise<SpendResult>((resolve) =>
        getSocket()
          .timeout(8_000)
          .emit('gift:send', id, (err, r) => resolve(err ? { ok: false, reason: 'invalid' } : r)),
      ),
    [],
  );
  /** 🚀 Boost: matched first for a while. */
  const buyBoost = useCallback(() => ask('boost:buy'), []);
  /** Out of free matches: spend coins for more. */
  const buyMatches = useCallback(() => ask('limit:buy'), []);

  /** 🎲 Ask for an icebreaker question (both people see it). */
  const askIcebreaker = useCallback(() => {
    if (matchRef.current) getSocket().emit('icebreaker');
  }, []);
  const dismissIcebreaker = useCallback(() => setIcebreaker(null), []);

  /** ❤️ Add friend with the current partner. */
  const addFriend = useCallback(() => {
    if (!matchRef.current) return;
    getSocket().emit('friend:add');
  }, []);

  /** My friends (null when not logged in). */
  const listFriends = useCallback(
    () => new Promise<Friend[] | null>((resolve) => getSocket().timeout(8_000).emit('friends:list', (err, list) => resolve(err ? [] : list))),
    [],
  );

  const callFriend = useCallback(
    (id: string) =>
      new Promise<CallRequestResult>((resolve) =>
        getSocket()
          .timeout(8_000)
          .emit('friends:call', id, (err, result) => {
            const r: CallRequestResult = err ? { ok: false, reason: 'gone' } : result;
            if (r.ok) setOutgoingCall({ publicId: `friend:${id}`, expiresAt: r.expiresAt });
            resolve(r);
          }),
      ),
    [],
  );

  const removeFriend = useCallback(
    (id: string) => new Promise<boolean>((resolve) => getSocket().timeout(8_000).emit('friends:remove', id, (err, ok) => resolve(!err && ok))),
    [],
  );

  const renameFriend = useCallback(
    (id: string, nickname: string) =>
      new Promise<boolean>((resolve) => getSocket().timeout(8_000).emit('friends:rename', id, nickname, (err, ok) => resolve(!err && ok))),
    [],
  );

  /** Plus: people online now, or null without Plus. */
  const listUsers = useCallback(
    () => new Promise<ActiveUser[] | null>((resolve) => getSocket().timeout(8_000).emit('users:list', (err, users) => resolve(err ? [] : users))),
    [],
  );

  /** Plus: ask someone on the list to chat. */
  const callUser = useCallback(
    (publicId: string) =>
      new Promise<CallRequestResult>((resolve) =>
        getSocket()
          .timeout(8_000)
          .emit('users:call', publicId, (err, result) => {
            const r: CallRequestResult = err ? { ok: false, reason: 'gone' } : result;
            if (r.ok) setOutgoingCall({ publicId, expiresAt: r.expiresAt });
            resolve(r);
          }),
      ),
    [],
  );

  const cancelCall = useCallback(() => {
    getSocket().emit('users:cancel');
    setOutgoingCall(null);
  }, []);

  const answerCall = useCallback(
    (accept: boolean) => {
      if (!incomingCall) return;
      getSocket().emit('users:answer', incomingCall.requestId, accept);
      setIncomingCall(null);
    },
    [incomingCall],
  );

  const watchRewardAd = useCallback(async () => {
    if (!limit || limit.adsLeft <= 0) return;
    const startedAt = Date.now();
    getSocket().emit('limit:ad-start');
    window.clearTimeout(timers.current.reward);
    // A real rewarded video (Google Ad Manager) when configured and filled…
    if (GAM_REWARDED_UNIT) {
      const result = await showRewardedAd();
      if (result === 'granted') {
        // The server also checks the time, so never report earlier than adMs.
        const wait = Math.max(0, startedAt + limit.adMs - Date.now());
        timers.current.reward = window.setTimeout(() => getSocket().emit('limit:ad-done'), wait);
        return;
      }
      if (result === 'closed') return flash('Watch the whole video to unlock matches.');
    }
    // …otherwise our own ad with a countdown.
    setRewardAd({ endsAt: Date.now() + limit.adMs });
    timers.current.reward = window.setTimeout(() => getSocket().emit('limit:ad-done'), Math.max(limit.adMs, startedAt + limit.adMs - Date.now()));
  }, [limit, flash]);

  const switchDevice = useCallback(
    async (kind: 'video' | 'audio', deviceId: string) => {
      const local = localRef.current;
      if (!local) return;
      if (kind === 'video' && effectRef.current) {
        // Keep the effect; just feed it the new camera.
        const fresh = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } }).catch(() => null);
        const cam = fresh?.getVideoTracks()[0];
        if (!cam) return flash('Could not switch to that device.');
        rawCameraRef.current?.stop();
        rawCameraRef.current = cam;
        await effectRef.current.setInput(cam);
        setCameraId(cam.getSettings().deviceId ?? deviceId);
        return;
      }
      const old = kind === 'video' ? local.getVideoTracks()[0] : local.getAudioTracks()[0];
      const fresh = await navigator.mediaDevices
        .getUserMedia(kind === 'video' ? { video: { deviceId: { exact: deviceId } } } : { audio: { deviceId: { exact: deviceId } } })
        .catch(() => null);
      const track = kind === 'video' ? fresh?.getVideoTracks()[0] : fresh?.getAudioTracks()[0];
      if (!track) return flash('Could not switch to that device.');

      track.enabled = old ? old.enabled : true;
      const sender = pcRef.current?.getSenders().find((s) => s.track?.kind === kind);
      await sender?.replaceTrack(track);
      const others = kind === 'video' ? local.getAudioTracks() : local.getVideoTracks();
      old?.stop();
      adoptStream(new MediaStream([...(kind === 'video' ? [track] : []), ...others, ...(kind === 'audio' ? [track] : [])]));
    },
    [adoptStream, flash],
  );

  const sendMessage = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || !matchRef.current) return false;
      getSocket().emit('chat:message', text);
      if (typingSent.current) {
        typingSent.current = false;
        getSocket().emit('chat:typing', false);
      }
      addLine('me', text);
      return true;
    },
    [addLine],
  );

  /** Call on every keystroke; sends typing=true once and typing=false after a pause. */
  const notifyTyping = useCallback(() => {
    if (!matchRef.current) return;
    if (!typingSent.current) {
      typingSent.current = true;
      getSocket().emit('chat:typing', true);
    }
    clearTimer('typing');
    timers.current.typing = window.setTimeout(() => {
      typingSent.current = false;
      getSocket().emit('chat:typing', false);
    }, TYPING_IDLE_MS);
  }, []);

  const setPartnerVideo = useCallback((el: HTMLVideoElement | null) => {
    partnerVideoRef.current = el;
    // If my own camera is floating and a stranger appears, float them instead.
    el?.addEventListener('loadeddata', () => {
      if (document.pictureInPictureElement && document.pictureInPictureElement === selfPipRef.current) {
        void el.requestPictureInPicture().catch(() => undefined);
      }
    });
  }, []);

  /**
   * Floats the call in a browser picture-in-picture window, like Meet: the
   * stranger's video when there is one, otherwise my own camera.
   */
  const togglePictureInPicture = useCallback(async () => {
    try {
      if (document.pictureInPictureElement) return void (await document.exitPictureInPicture());
      if (!document.pictureInPictureEnabled) {
        return flash('This browser does not support picture-in-picture. Try Chrome, Edge or Safari.');
      }
      const hasFrames = (v: HTMLVideoElement | null) => !!v && v.readyState >= 2 && v.videoWidth > 0;
      let target = partnerVideoRef.current;
      if (target && (target.srcObject || target.src) && !hasFrames(target)) {
        // Stranger's video is still starting: give it a moment.
        await new Promise((r) => setTimeout(r, 800));
      }
      if (!hasFrames(target)) {
        // Nobody on screen yet: float my own camera instead.
        const local = localRef.current;
        if (!local || !local.getVideoTracks().length) return flash('Turn on your camera or start a chat to use picture-in-picture.');
        const self = (selfPipRef.current ??= Object.assign(document.createElement('video'), { muted: true, playsInline: true }));
        if (self.srcObject !== local) self.srcObject = local;
        await self.play().catch(() => undefined);
        if (self.readyState < 1) await new Promise((r) => self.addEventListener('loadedmetadata', r, { once: true }));
        target = self;
      }
      await target!.requestPictureInPicture();
    } catch {
      flash('This browser could not open picture-in-picture. Click the button again, or try Chrome.');
    }
  }, [flash]);

  const report = useCallback(
    (target: 'current' | 'previous', reason: ReportReason, note?: string) => {
      const shot = target === 'current' ? snapshot(partnerVideoRef.current) ?? snapshots.current.current : snapshots.current.previous;
      getSocket().emit('report:submit', { target, reason, source: 'user', note: note?.trim() || undefined, snapshot: shot });
    },
    [],
  );

  const block = useCallback((target: 'current' | 'previous') => {
    if (target === 'current') {
      setHasPrevious(true);
      closePeer();
      setMessages([]);
      if (activeRef.current) {
        setStatus('searching');
        startAdBreak();
      }
    }
    getSocket().emit('user:block', target);
  }, [closePeer, startAdBreak]);

  /** Hide the partner's video, or show it again (also undoes an AI blur). */
  const togglePartnerHidden = useCallback(() => {
    if (partnerHidden || aiHidden) {
      setPartnerHidden(false);
      setAiHidden(false);
    } else setPartnerHidden(true);
  }, [partnerHidden, aiHidden]);

  const appeal = useCallback((message: string) => {
    if (message.trim()) getSocket().emit('ban:appeal', message.trim());
  }, []);

  const toggleCamera = useCallback(() => {
    const track = localRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCameraOn(track.enabled);
  }, []);

  const toggleMic = useCallback(() => {
    const track = localRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  }, []);

  // Filters changed (in this tab or another): apply them to the next match, and
  // right away if we are waiting in the queue.
  useEffect(
    () =>
      onSettingsChange(() => {
        const join = joinRef.current;
        const filters = loadSettings().filters;
        if (!join || sameFilters(join.filters, filters)) return;
        joinRef.current = { ...join, filters };
        setFiltering(hasFilters(filters));
        setPlusRequired(false);
        if (activeRef.current && !pcRef.current && !matchRef.current) getSocket().emit('queue:join', joinRef.current);
      }),
    [],
  );

  // Offer "connect to anyone" when filtered searching takes a while.
  useEffect(() => {
    window.clearTimeout(timers.current.patience);
    setSearchingLong(false);
    if (status !== 'searching' || !filtering) return;
    timers.current.patience = window.setTimeout(() => setSearchingLong(true), FILTER_PATIENCE_MS);
    return () => window.clearTimeout(timers.current.patience);
  }, [status, filtering]);

  const setAdFree = useCallback((adFree: boolean) => {
    adFreeRef.current = adFree;
    if (adFree) {
      window.clearTimeout(timers.current.ad);
      setAdBreak(false);
    }
  }, []);

  // Screen the partner's incoming video on this device. The receiver runs the
  // check, so the sender cannot switch it off. Also keeps a recent snapshot.
  useEffect(() => {
    if (status !== 'in-call' || mode !== 'video') return;
    let hits = 0;
    let cancelled = false;
    let busy = false;
    const tick = async () => {
      const video = partnerVideoRef.current;
      if (busy || !video) return;
      busy = true;
      try {
        const shot = snapshot(video);
        if (shot) snapshots.current.current = shot;
        const score = await explicitScore(video);
        if (cancelled || score === null) return;
        hits = score >= SCREEN_THRESHOLD ? hits + 1 : 0;
        if (hits >= SCREEN_HITS && !aiReported.current) {
          aiReported.current = true;
          setAiHidden(true);
          flash('We blurred this video because it may contain nudity. It was reported automatically.');
          getSocket().emit('report:submit', {
            target: 'current',
            reason: 'nudity',
            source: 'ai',
            snapshot: shot,
            aiScore: Math.min(1, score),
          });
        }
      } catch (e) {
        console.warn('[screening]', e);
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(() => void tick(), SCREEN_EVERY_MS);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [status, mode, flash]);

  // Release the camera and leave the queue when the page unmounts.
  useEffect(
    () => () => {
      activeRef.current = false;
      Object.values(timers.current).forEach((t) => window.clearTimeout(t));
      pcRef.current?.close();
      localRef.current?.getTracks().forEach((t) => t.stop());
      effectRef.current?.stop();
      rawCameraRef.current?.stop();
      getSocket().emit('queue:leave');
    },
    [],
  );

  return {
    status,
    mode,
    online,
    partner,
    lastLeftReason,
    localStream,
    remoteStream,
    cameraOn,
    micOn,
    blurPartner,
    messages,
    partnerTyping,
    canGoBack: hasPrevious,
    notice,
    allowReconnect,
    cameras,
    mics,
    cameraId,
    micId,
    start,
    next,
    back,
    stop,
    toggleCamera,
    toggleMic,
    switchDevice,
    sendMessage,
    notifyTyping,
    ban,
    partnerHidden,
    aiHidden,
    setPartnerVideo,
    report,
    block,
    togglePartnerHidden,
    appeal,
    adBreak,
    adKey,
    relayActive,
    plusRequired,
    searchingLong,
    setAdFree,
    dismissPlusRequired: () => setPlusRequired(false),
    limit,
    limitReached,
    rewardAd,
    watchRewardAd,
    reactions,
    sendReaction,
    togglePictureInPicture,
    background,
    backgroundBusy,
    setBackground,
    incomingCall,
    outgoingCall,
    friendState,
    browseFor,
    noFace,
    retryFaceCheck,
    wallet,
    gifts,
    sendGift,
    buyBoost,
    buyMatches,
    icebreaker,
    askIcebreaker,
    dismissIcebreaker,
    addFriend,
    listFriends,
    callFriend,
    removeFriend,
    renameFriend,
    listUsers,
    callUser,
    cancelCall,
    answerCall,
  };
}

export type RandomCall = ReturnType<typeof useRandomCall>;

const CALL_ANSWER_TEXT: Record<Extract<CallAnswer, { accepted: false }>['reason'], string> = {
  declined: 'They said no this time. Try someone else!',
  timeout: 'No answer. Try someone else!',
  busy: 'They just started another chat.',
  gone: 'They left before answering.',
};

/** 'host' | 'srflx' | 'prflx' | 'relay' from an ICE candidate line. */
function candidateType(line: string): CandidateType | null {
  const m = line.match(/ typ (host|srflx|prflx|relay)/);
  return m ? (m[1] as CandidateType) : null;
}

/** Kinds of the candidate pair the browser selected, e.g. ['srflx', 'relay']. */
async function selectedPath(pc: RTCPeerConnection): Promise<[CandidateType, CandidateType] | null> {
  try {
    const stats = await pc.getStats();
    let pair: RTCIceCandidatePairStats | undefined;
    stats.forEach((r) => {
      if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId);
    });
    if (!pair) stats.forEach((r) => r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded' && (pair ??= r));
    if (!pair) return null;
    const local = stats.get(pair.localCandidateId)?.candidateType as CandidateType | undefined;
    const remote = stats.get(pair.remoteCandidateId)?.candidateType as CandidateType | undefined;
    return local && remote ? [local, remote] : null;
  } catch {
    return null;
  }
}
