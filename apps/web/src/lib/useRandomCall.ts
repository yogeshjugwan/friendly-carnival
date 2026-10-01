'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BackUnavailableReason,
  ChatMessage,
  ChatMode,
  JoinPayload,
  MatchFound,
  PartnerInfo,
  PartnerLeftReason,
  SignalMessage,
} from '@rc/shared';
import { getSocket } from './socket';

export type CallStatus =
  | 'idle' // landing screen
  | 'requesting-media' // waiting on the camera/mic prompt
  | 'media-denied' // user blocked the camera or mic
  | 'searching' // in the match queue
  | 'connecting' // matched, WebRTC negotiating
  | 'in-call'; // media flowing (or text chat open)

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
const RECONNECT_PREF_KEY = 'rc.allowReconnect';

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

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const joinRef = useRef<JoinPayload | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const activeRef = useRef(false);
  const matchRef = useRef<{ id: string; startedAt: number; reported: boolean } | null>(null);
  const timers = useRef<{ connect?: number; disconnect?: number; blur?: number; typing?: number; notice?: number }>({});
  const lineId = useRef(0);
  const typingSent = useRef(false);

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

  const reportResult = useCallback((connected: boolean) => {
    const match = matchRef.current;
    if (!match || match.reported) return;
    match.reported = true;
    getSocket().emit('call:result', { matchId: match.id, connected, ms: Date.now() - match.startedAt });
  }, []);

  const closePeer = useCallback(() => {
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
    setRemoteStream(null);
    setPartner(null);
    setPartnerTyping(false);
    setBlurPartner(false);
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
    getSocket().emit('call:next');
  }, [closePeer]);

  const back = useCallback(() => {
    if (!activeRef.current) return;
    getSocket().emit('call:back');
  }, []);

  const markConnected = useCallback(() => {
    clearTimer('connect');
    clearTimer('disconnect');
    setStatus('in-call');
    reportResult(true);
    setBlurPartner(true);
    timers.current.blur = window.setTimeout(() => setBlurPartner(false), BLUR_MS);
  }, [reportResult]);

  const startPeer = useCallback(
    async (match: MatchFound) => {
      const local = localRef.current;
      if (!local) return;

      const socket = getSocket();
      const pc = new RTCPeerConnection({ iceServers: match.iceServers });
      // No direct or relayed path (or it dropped for good): count it, then move on.
      const giveUp = () => {
        reportResult(false);
        next();
      };
      pcRef.current = pc;
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
        if (event.candidate) socket.emit('signal', { kind: 'ice', candidate: event.candidate.toJSON() });
      };

      pc.onconnectionstatechange = () => {
        if (pcRef.current !== pc) return;
        const state = pc.connectionState;
        if (state === 'connected') markConnected();
        else if (state === 'failed') giveUp();
        else if (state === 'disconnected') {
          // Often recovers on its own (network blip); give it a moment first.
          clearTimer('disconnect');
          timers.current.disconnect = window.setTimeout(() => {
            if (pcRef.current === pc && pc.connectionState !== 'connected') giveUp();
          }, DISCONNECT_GRACE_MS);
        }
      };

      timers.current.connect = window.setTimeout(() => {
        if (pcRef.current === pc && pc.connectionState !== 'connected') giveUp();
      }, CONNECT_TIMEOUT_MS);

      if (match.initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('signal', { kind: 'offer', sdp: offer.sdp ?? '' });
      }
    },
    [markConnected, next, reportResult],
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
      if (pcRef.current || matchRef.current) setHasPrevious(true);
      closePeer();
      matchRef.current = { id: match.matchId, startedAt: Date.now(), reported: false };
      setPartner(match.partner);
      setLastLeftReason(null);
      setMessages([]);
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
      requeue();
    };
    const onBackUnavailable = (reason: BackUnavailableReason) => flash(BACK_TEXT[reason]);
    const onChat = (msg: ChatMessage) => {
      setPartnerTyping(false);
      addLine('them', msg.text, msg.at);
    };
    const onTyping = (typing: boolean) => setPartnerTyping(typing);
    const onRejected = (reason: 'rate-limited' | 'invalid') =>
      flash(reason === 'rate-limited' ? 'Slow down a little — too many messages.' : 'That message could not be sent.');
    const onError = (message: string) => console.warn('[server]', message);

    socket.on('stats', onStats);
    socket.on('match:found', onMatch);
    socket.on('signal', onSignal);
    socket.on('partner:left', onLeft);
    socket.on('back:unavailable', onBackUnavailable);
    socket.on('chat:message', onChat);
    socket.on('chat:typing', onTyping);
    socket.on('chat:rejected', onRejected);
    socket.on('error:message', onError);
    return () => {
      socket.off('stats', onStats);
      socket.off('match:found', onMatch);
      socket.off('signal', onSignal);
      socket.off('partner:left', onLeft);
      socket.off('back:unavailable', onBackUnavailable);
      socket.off('chat:message', onChat);
      socket.off('chat:typing', onTyping);
      socket.off('chat:rejected', onRejected);
      socket.off('error:message', onError);
    };
  }, [startPeer, handleSignal, closePeer, requeue, addLine, flash]);

  // Restore the reconnect preference and tell the server on (re)connect.
  useEffect(() => {
    let allow = true;
    try {
      allow = window.localStorage.getItem(RECONNECT_PREF_KEY) !== 'false';
    } catch {
      /* storage unavailable: keep the default */
    }
    setAllowReconnectState(allow);
    const socket = getSocket();
    const sync = () => socket.emit('settings:reconnect', allow);
    sync();
    socket.on('connect', sync);
    return () => void socket.off('connect', sync);
  }, []);

  const setAllowReconnect = useCallback((allow: boolean) => {
    setAllowReconnectState(allow);
    try {
      window.localStorage.setItem(RECONNECT_PREF_KEY, String(allow));
    } catch {
      /* ignore */
    }
    getSocket().emit('settings:reconnect', allow);
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

  const adoptStream = useCallback((stream: MediaStream) => {
    localRef.current = stream;
    setLocalStream(stream);
    setCameraId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? null);
    setMicId(stream.getAudioTracks()[0]?.getSettings().deviceId ?? null);
  }, []);

  const start = useCallback(
    async (join: Omit<JoinPayload, 'mode'>, chatMode: ChatMode = 'video') => {
      const payload: JoinPayload = { ...join, mode: chatMode };
      joinRef.current = payload;
      setMode(chatMode);
      setLastLeftReason(null);
      setMessages([]);
      setHasPrevious(false);

      if (chatMode === 'video' && !localRef.current) {
        setStatus('requesting-media');
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          adoptStream(stream);
          setCameraOn(true);
          setMicOn(true);
          void refreshDevices();
        } catch {
          setStatus('media-denied');
          return;
        }
      }

      activeRef.current = true;
      setStatus('searching');
      getSocket().emit('queue:join', payload);
    },
    [adoptStream, refreshDevices],
  );

  const stop = useCallback(() => {
    activeRef.current = false;
    closePeer();
    setMessages([]);
    setHasPrevious(false);
    getSocket().emit('queue:leave');
    setStatus('idle');
  }, [closePeer]);

  const switchDevice = useCallback(
    async (kind: 'video' | 'audio', deviceId: string) => {
      const local = localRef.current;
      if (!local) return;
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

  // Release the camera and leave the queue when the page unmounts.
  useEffect(
    () => () => {
      activeRef.current = false;
      Object.values(timers.current).forEach((t) => window.clearTimeout(t));
      pcRef.current?.close();
      localRef.current?.getTracks().forEach((t) => t.stop());
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
    setAllowReconnect,
  };
}

export type RandomCall = ReturnType<typeof useRandomCall>;
