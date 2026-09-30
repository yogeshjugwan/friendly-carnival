'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { JoinPayload, MatchFound, PartnerInfo, PartnerLeftReason, SignalMessage } from '@rc/shared';
import { getSocket } from './socket';

export type CallStatus =
  | 'idle' // landing screen
  | 'requesting-media' // waiting on the camera/mic prompt
  | 'media-denied' // user blocked the camera or mic
  | 'searching' // in the match queue
  | 'connecting' // matched, WebRTC negotiating
  | 'in-call'; // media flowing

export interface RandomCall {
  status: CallStatus;
  online: number | null;
  partner: PartnerInfo | null;
  lastLeftReason: PartnerLeftReason | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  cameraOn: boolean;
  micOn: boolean;
  start: (join: JoinPayload) => Promise<void>;
  next: () => void;
  stop: () => void;
  toggleCamera: () => void;
  toggleMic: () => void;
}

export function useRandomCall(): RandomCall {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [online, setOnline] = useState<number | null>(null);
  const [partner, setPartner] = useState<PartnerInfo | null>(null);
  const [lastLeftReason, setLastLeftReason] = useState<PartnerLeftReason | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const joinRef = useRef<JoinPayload | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const activeRef = useRef(false);

  const closePeer = useCallback(() => {
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
  }, []);

  const requeue = useCallback(() => {
    if (!activeRef.current || !joinRef.current) return;
    setStatus('searching');
    getSocket().emit('queue:join', joinRef.current);
  }, []);

  const next = useCallback(() => {
    if (!activeRef.current) return;
    closePeer();
    setLastLeftReason(null);
    setStatus('searching');
    getSocket().emit('call:next');
  }, [closePeer]);

  const startPeer = useCallback(
    async (match: MatchFound) => {
      closePeer();
      const local = localRef.current;
      if (!local) return;

      const socket = getSocket();
      const pc = new RTCPeerConnection({ iceServers: match.iceServers });
      pcRef.current = pc;
      setPartner(match.partner);
      setStatus('connecting');

      local.getTracks().forEach((track) => pc.addTrack(track, local));

      const remote = new MediaStream();
      setRemoteStream(remote);
      pc.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((t) => remote.addTrack(t));
        if (!event.streams[0]) remote.addTrack(event.track);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) socket.emit('signal', { kind: 'ice', candidate: event.candidate.toJSON() });
      };

      pc.onconnectionstatechange = () => {
        if (pcRef.current !== pc) return;
        if (pc.connectionState === 'connected') setStatus('in-call');
        // No direct or relayed path: skip to someone else rather than hang.
        if (pc.connectionState === 'failed') next();
      };

      if (match.initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('signal', { kind: 'offer', sdp: offer.sdp ?? '' });
      }
    },
    [closePeer, next],
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
    const onMatch = (match: MatchFound) => void startPeer(match);
    const onSignal = (msg: SignalMessage) => void handleSignal(msg).catch((e) => console.warn('[signal]', e));
    const onLeft = (reason: PartnerLeftReason) => {
      closePeer();
      setLastLeftReason(reason);
      requeue();
    };
    const onError = (message: string) => console.warn('[server]', message);

    socket.on('stats', onStats);
    socket.on('match:found', onMatch);
    socket.on('signal', onSignal);
    socket.on('partner:left', onLeft);
    socket.on('error:message', onError);
    return () => {
      socket.off('stats', onStats);
      socket.off('match:found', onMatch);
      socket.off('signal', onSignal);
      socket.off('partner:left', onLeft);
      socket.off('error:message', onError);
    };
  }, [startPeer, handleSignal, closePeer, requeue]);

  const start = useCallback(async (join: JoinPayload) => {
    joinRef.current = join;
    setLastLeftReason(null);

    if (!localRef.current) {
      setStatus('requesting-media');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        localRef.current = stream;
        setLocalStream(stream);
        setCameraOn(true);
        setMicOn(true);
      } catch {
        setStatus('media-denied');
        return;
      }
    }

    activeRef.current = true;
    setStatus('searching');
    getSocket().emit('queue:join', join);
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    closePeer();
    getSocket().emit('queue:leave');
    setStatus('idle');
  }, [closePeer]);

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
      pcRef.current?.close();
      localRef.current?.getTracks().forEach((t) => t.stop());
      getSocket().emit('queue:leave');
    },
    [],
  );

  return {
    status,
    online,
    partner,
    lastLeftReason,
    localStream,
    remoteStream,
    cameraOn,
    micOn,
    start,
    next,
    stop,
    toggleCamera,
    toggleMic,
  };
}
