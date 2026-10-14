'use client';

import { useEffect, useRef } from 'react';
import type { JoinPayload } from '@rc/shared';
import { useAuth } from '@/lib/auth';
import { useRandomCall } from '@/lib/useRandomCall';
import { BannedScreen } from './BannedScreen';
import { ChatScreen } from './ChatScreen';
import { Landing } from './Landing';
import { StateActions, StateCard } from './StateCard';
import { VideoTile } from './VideoTile';
import { useI18n } from '@/lib/i18n';
import { CAMERA_PROBLEM } from '@/lib/cameraCheck';

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
      <main className="flex h-full flex-col items-center justify-center gap-3 bg-night p-6 text-center">
        <p className="font-display text-[28px] font-bold">{t('perm.title')}</p>
        <p className="text-mute">{t('perm.body')}</p>
      </main>
    );
  }

  if (call.status === 'face-check' || call.status === 'no-face') {
    const missing = call.status === 'no-face';
    const problem = call.cameraProblem;
    return (
      <main className="flex h-full flex-col items-center justify-center gap-4 bg-night p-6 text-center">
        <div className={`relative w-full max-w-sm overflow-hidden rounded-2xl ring-4 transition-colors ${missing ? 'ring-amber-400' : 'ring-lime/60'}`}>
          <VideoTile stream={call.localStream} muted mirrored className="aspect-[4/3] w-full rounded-none" />
          {/* Face guide */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className={`h-3/5 w-2/5 rounded-[50%] border-4 border-dashed ${missing ? 'border-amber-400' : 'border-white/60'}`} />
          </div>
        </div>
        {missing ? (
          <>
            <p className="font-display text-[28px] font-bold">{problem ? CAMERA_PROBLEM[problem].title : t('face.title')}</p>
            <p className="max-w-md text-mute">
              {problem
                ? CAMERA_PROBLEM[problem].help
                : 'Look at the camera with your face inside the oval and good light. Video chats need a visible face — this keeps randomCall safe for everyone.'}{' '}
              Nothing leaves your device for this check.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button onClick={call.retryFaceCheck} className="h-12 rounded-[14px] bg-lime px-6 font-display font-bold text-night hover:bg-lime-hover">
                Try again
              </button>
              <button onClick={() => void call.start(lastJoin.current, 'text')} className="h-12 rounded-[14px] border border-line-2 px-6 font-medium text-[#e6e8ec] hover:border-[#3a3f4a]">
                Text chat instead
              </button>
              <button onClick={call.stop} className="h-12 rounded-[14px] px-5 font-medium text-mute hover:text-white">
                Back
              </button>
            </div>
          </>
        ) : (
          <p className="flex items-center gap-2 text-lg text-[#e6e8ec]">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-2 border-t-lime" aria-hidden />
            Checking your camera…
          </p>
        )}
      </main>
    );
  }

  if (call.status === 'media-denied') {
    return (
      <main className="h-full">
        <StateCard icon="camOff" tone="danger" title={t('perm.blocked')} body="randomCall needs your camera and microphone for video chat.">
          <ol className="m-0 pl-5 text-left text-sm leading-[1.8] text-[#c9cdd4]">
            <li>Click the lock icon in the address bar</li>
            <li>
              Set <b>Camera</b> and <b>Microphone</b> to Allow
            </li>
            <li>Press Try again</li>
          </ol>
          <StateActions
            actions={[
              { label: 'Try again', kind: 'primary', onClick: () => void call.start(lastJoin.current, call.mode) },
              { label: 'Use text chat instead', kind: 'outline', onClick: () => void call.start(lastJoin.current, 'text') },
              { label: 'Back', kind: 'link', onClick: call.stop },
            ]}
          />
        </StateCard>
      </main>
    );
  }

  return <ChatScreen call={call} />;
}
