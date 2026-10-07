'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Gender, ReportReason, RoomChat, RoomJoinResult, RoomMember, RTCIceServerLike, SignalMessage } from '@rc/shared';
import { getSocket } from './socket';

type Phase = 'lobby' | 'joining' | 'in-room' | 'media-denied' | 'error';

interface Peer {
  pc: RTCPeerConnection;
  pendingIce: RTCIceCandidateInit[];
}

/**
 * A group room: one RTCPeerConnection per other member (a small mesh). The
 * newcomer sends offers to everyone already there; members answer.
 */
export function useRoom() {
  const [phase, setPhase] = useState<Phase>('lobby');
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const [chat, setChat] = useState<(RoomChat & { mine: boolean })[]>([]);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [mode, setMode] = useState<'video' | 'voice'>('video');
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [topic, setTopic] = useState<string | null>(null);

  const peers = useRef(new Map<string, Peer>());
  const localRef = useRef<MediaStream | null>(null);
  const iceRef = useRef<RTCIceServerLike[]>([]);
  const youRef = useRef<string | null>(null);

  const dropPeer = useCallback((id: string) => {
    peers.current.get(id)?.pc.close();
    peers.current.delete(id);
    setStreams(({ [id]: _gone, ...rest }) => rest);
  }, []);

  const makePeer = useCallback((id: string): Peer => {
    const existing = peers.current.get(id);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: iceRef.current as RTCIceServer[] });
    const peer: Peer = { pc, pendingIce: [] };
    peers.current.set(id, peer);
    localRef.current?.getTracks().forEach((t) => pc.addTrack(t, localRef.current!));
    pc.onicecandidate = (e) => {
      if (e.candidate) getSocket().emit('room:signal', id, { kind: 'ice', candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      setStreams((s) => ({ ...s, [id]: stream }));
    };
    return peer;
  }, []);

  const call = useCallback(
    async (id: string) => {
      const { pc } = makePeer(id);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      getSocket().emit('room:signal', id, { kind: 'offer', sdp: offer.sdp ?? '' });
    },
    [makePeer],
  );

  const onSignal = useCallback(
    async ({ from, msg }: { from: string; msg: SignalMessage }) => {
      const peer = makePeer(from);
      const { pc } = peer;
      if (msg.kind === 'offer') {
        await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        getSocket().emit('room:signal', from, { kind: 'answer', sdp: answer.sdp ?? '' });
      } else if (msg.kind === 'answer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
      } else {
        const c = msg.candidate as RTCIceCandidateInit;
        if (!pc.remoteDescription) return void peer.pendingIce.push(c);
        await pc.addIceCandidate(c).catch(() => undefined);
        return;
      }
      const queued = peer.pendingIce;
      peer.pendingIce = [];
      for (const c of queued) await pc.addIceCandidate(c).catch(() => undefined);
    },
    [makePeer],
  );

  const cleanup = useCallback(() => {
    for (const id of [...peers.current.keys()]) dropPeer(id);
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    setLocal(null);
    setMembers([]);
    setStreams({});
    youRef.current = null;
  }, [dropPeer]);

  useEffect(() => {
    const socket = getSocket();
    const joined = (m: RoomMember) => setMembers((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
    const left = (id: string) => {
      setMembers((list) => list.filter((x) => x.id !== id));
      dropPeer(id);
    };
    const signal = (s: { from: string; msg: SignalMessage }) => void onSignal(s).catch((e) => console.warn('[room]', e));
    const message = (c: RoomChat) => setChat((list) => [...list.slice(-99), { ...c, mine: c.from === youRef.current }]);
    socket.on('room:member-joined', joined);
    socket.on('room:member-left', left);
    socket.on('room:signal', signal);
    socket.on('room:chat', message);
    return () => {
      socket.off('room:member-joined', joined);
      socket.off('room:member-left', left);
      socket.off('room:signal', signal);
      socket.off('room:chat', message);
    };
  }, [dropPeer, onSignal]);

  // Leaving the page leaves the room.
  useEffect(
    () => () => {
      getSocket().emit('room:leave');
      cleanup();
    },
    [cleanup],
  );

  const join = useCallback(
    async (roomTopic: string, roomMode: 'video' | 'voice', gender: Gender) => {
      setError(null);
      setPhase('joining');
      setMode(roomMode);
      setTopic(roomTopic);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: roomMode === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        localRef.current = stream;
        setLocal(stream);
        setMicOn(true);
        setCameraOn(roomMode === 'video');
      } catch {
        setPhase('media-denied');
        return;
      }
      const r = await new Promise<RoomJoinResult>((resolve) =>
        getSocket()
          .timeout(15_000)
          .emit('room:join', roomTopic, roomMode, gender, (err, res) => resolve(err ? { ok: false, reason: 'busy' } : res)),
      );
      if (!r.ok) {
        cleanup();
        setError(
          r.reason === 'login-required'
            ? 'Log in to join group rooms.'
            : r.reason === 'banned'
              ? 'Your account is restricted.'
              : 'Could not join — try again.',
        );
        setPhase('error');
        return;
      }
      iceRef.current = r.iceServers;
      youRef.current = r.you;
      setMembers(r.members);
      setChat([]);
      setPhase('in-room');
      for (const m of r.members) void call(m.id).catch((e) => console.warn('[room]', e));
    },
    [call, cleanup],
  );

  const leave = useCallback(() => {
    getSocket().emit('room:leave');
    cleanup();
    setPhase('lobby');
  }, [cleanup]);

  const toggleMic = useCallback(() => {
    const t = localRef.current?.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setMicOn(t.enabled);
  }, []);
  const toggleCamera = useCallback(() => {
    const t = localRef.current?.getVideoTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setCameraOn(t.enabled);
  }, []);

  const send = useCallback((text: string) => {
    if (text.trim()) getSocket().emit('room:chat', text.trim());
  }, []);

  /** Reports someone and leaves; you're never put in a room with them again. */
  const report = useCallback(
    (id: string, reason: ReportReason) => {
      const socket = getSocket();
      socket.emit('room:report', id, reason);
      socket.emit('room:leave');
      cleanup();
      setError('Thanks — we got your report. You left that room and won’t be matched with them again.');
      setPhase('lobby');
    },
    [cleanup],
  );

  return { phase, error, members, streams, chat, local, mode, micOn, cameraOn, topic, join, leave, toggleMic, toggleCamera, send, report };
}

export type RoomCall = ReturnType<typeof useRoom>;
