'use client';

import { useEffect, useRef } from 'react';
import type { JoinPayload } from '@rc/shared';
import { useAuth } from '@/lib/auth';
import { useRandomCall } from '@/lib/useRandomCall';
import { BannedScreen } from './BannedScreen';
import { ChatScreen } from './ChatScreen';
import { Landing } from './Landing';
import { VideoTile } from './VideoTile';
import { useI18n } from '@/lib/i18n';

export function RandomCall() {
  const { t } = useI18n();
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
        onStart={(join, mode, browse) => {
          lastJoin.current = join;
          void call.start(join, mode, browse);
        }}
      />
    );
  }

  if (call.status === 'requesting-media') {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-2xl font-semibold">{t('perm.title')}</p>
        <p className="text-slate-400">{t('perm.body')}</p>
      </main>
    );
  }

  if (call.status === 'face-check' || call.status === 'no-face') {
    const missing = call.status === 'no-face';
    return (
      <main className="flex h-full flex-col items-center justify-center gap-4 bg-[#202124] p-6 text-center">
        <div className={`relative w-full max-w-sm overflow-hidden rounded-2xl ring-4 transition-colors ${missing ? 'ring-amber-400' : 'ring-sky-400/60'}`}>
          <VideoTile stream={call.localStream} muted mirrored className="aspect-[4/3] w-full rounded-none" />
          {/* Face guide */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className={`h-3/5 w-2/5 rounded-[50%] border-4 border-dashed ${missing ? 'border-amber-400' : 'border-white/60'}`} />
          </div>
        </div>
        {missing ? (
          <>
            <p className="text-2xl font-semibold">{t('face.title')}</p>
            <p className="max-w-md text-slate-400">
              Look at the camera with your face inside the oval and good light. Video chats need a visible face — this keeps randomCall
              safe for everyone. Nothing leaves your device for this check.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button onClick={call.retryFaceCheck} className="rounded-lg bg-brand px-5 py-2 font-semibold">
                Try again
              </button>
              <button onClick={() => void call.start(lastJoin.current, 'text')} className="rounded-lg bg-slate-600 px-5 py-2 font-semibold">
                Text chat instead
              </button>
              <button onClick={call.stop} className="rounded-lg px-5 py-2 font-semibold text-slate-300 hover:text-white">
                Back
              </button>
            </div>
          </>
        ) : (
          <p className="flex items-center gap-2 text-lg text-slate-200">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-sky-300" aria-hidden />
            Checking your camera…
          </p>
        )}
      </main>
    );
  }

  if (call.status === 'media-denied') {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-2xl font-semibold">{t('perm.blocked')}</p>
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
