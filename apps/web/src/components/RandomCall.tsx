'use client';

import { useEffect, useRef } from 'react';
import type { JoinPayload } from '@rc/shared';
import { useAuth } from '@/lib/auth';
import { useRandomCall } from '@/lib/useRandomCall';
import { BannedScreen } from './BannedScreen';
import { ChatScreen } from './ChatScreen';
import { Landing } from './Landing';

export function RandomCall() {
  const call = useRandomCall();
  const { user } = useAuth();
  const isPlus = !!user?.plus.active;
  const { setAdFree } = call;
  // Plus members skip ads, including the one before the first match.
  useEffect(() => setAdFree(isPlus), [isPlus, setAdFree]);
  // Remember the landing choices so "use text chat instead" can reuse them.
  const lastJoin = useRef<Omit<JoinPayload, 'mode'>>({ gender: 'male', interests: [] });

  if (call.status === 'banned') return <BannedScreen call={call} />;

  if (call.status === 'idle') {
    return (
      <Landing
        online={call.online}
        onStart={(join, mode) => {
          lastJoin.current = join;
          void call.start(join, mode);
        }}
      />
    );
  }

  if (call.status === 'requesting-media') {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-2xl font-semibold">Click “Allow” to turn on your camera</p>
        <p className="text-slate-400">randomCall needs your camera and microphone to connect you with someone.</p>
      </main>
    );
  }

  if (call.status === 'media-denied') {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-2xl font-semibold">Camera or microphone blocked</p>
        <p className="max-w-md text-slate-400">
          Allow camera and microphone access for this site in your browser settings (the icon next to the address bar), then try
          again — or chat by text instead.
        </p>
        <div className="flex gap-3">
          <button onClick={() => void call.start(lastJoin.current, 'text')} className="rounded-lg bg-brand px-5 py-2 font-semibold">
            Start Text Chat
          </button>
          <button onClick={call.stop} className="rounded-lg bg-slate-600 px-5 py-2 font-semibold">
            Back
          </button>
        </div>
      </main>
    );
  }

  return <ChatScreen call={call} />;
}
