'use client';

import { useEffect, useState } from 'react';
import type { RandomCall } from '@/lib/useRandomCall';

/** 0–1 loudness of a stream's audio, updated ~10×/s. */
function useLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);
  // A partner's stream can arrive before its audio track does: look again shortly.
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const track = stream?.getAudioTracks()[0];
    if (!stream || !track) {
      setLevel(0);
      if (!stream) return;
      const t = window.setTimeout(() => setRetry((n) => n + 1), 500);
      return () => window.clearTimeout(t);
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    // Created without a tap it may start suspended; it resumes on the next one.
    void ctx.resume().catch(() => undefined);
    const resume = () => void ctx.resume().catch(() => undefined);
    window.addEventListener('pointerdown', resume);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const t = window.setInterval(() => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (const v of data) sum += v;
      setLevel(Math.min(1, sum / data.length / 40));
    }, 100);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('pointerdown', resume);
      void ctx.close();
    };
  }, [stream, retry]);
  return level;
}

function Person({ label, emoji, level, muted }: { label: string; emoji: string; level: number; muted?: boolean }) {
  const speaking = level > 0.08 && !muted;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <span
          className="absolute inset-0 rounded-full bg-emerald-400/40 transition-transform duration-100"
          style={{ transform: `scale(${1 + (speaking ? Math.min(0.35, level * 0.5) : 0)})` }}
          aria-hidden
        />
        <span
          className={`relative flex h-24 w-24 items-center justify-center rounded-full text-5xl sm:h-32 sm:w-32 sm:text-6xl ${
            speaking ? 'bg-emerald-600 ring-4 ring-emerald-300' : 'bg-[#3c4043]'
          }`}
        >
          {emoji}
        </span>
      </div>
      <span className="text-sm font-medium text-slate-200">
        {label}
        {muted && <span className="ml-1 text-red-300">· muted</span>}
      </span>
    </div>
  );
}

/** Voice-only call: two avatars that light up when each person talks. */
export function VoiceStage({ call, matched, partnerEmoji }: { call: RandomCall; matched: boolean; partnerEmoji: string }) {
  const mine = useLevel(call.localStream);
  const theirs = useLevel(matched ? call.remoteStream : null);
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-10 bg-gradient-to-b from-[#2d2e31] to-[#1f2023] sm:gap-20">
      <Person label="You" emoji="🙂" level={mine} muted={!call.micOn} />
      {matched ? (
        <Person label="Stranger" emoji={partnerEmoji} level={theirs} />
      ) : (
        <div className="flex flex-col items-center gap-2 text-slate-500">
          <span className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed border-slate-600 text-4xl sm:h-32 sm:w-32">?</span>
          <span className="text-sm">Waiting…</span>
        </div>
      )}
    </div>
  );
}
