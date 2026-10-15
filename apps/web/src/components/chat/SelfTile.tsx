'use client';

import { type RandomCall } from '@/lib/useRandomCall';
import { VideoTile } from '../VideoTile';

/** Your own camera as a tile ("You"), with mic / camera buttons on phones while matching. */
export function SelfTile({ call, className = '', controls = false }: { call: RandomCall; className?: string; controls?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-3xl bg-[linear-gradient(165deg,#3a4a6e,#1a2033)] ${className}`}>
      <VideoTile stream={call.localStream} muted mirrored className="pointer-events-none absolute inset-0 h-full w-full rounded-none !bg-transparent" videoClassName="absolute inset-0" />
      {(!call.localStream || !call.cameraOn) && (
        <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(165deg,#3a4a6e,#1a2033)] text-xs uppercase tracking-[0.08em] text-[#c9cdd4]">Camera off</div>
      )}
      <span className="absolute left-3 top-3 flex h-[30px] items-center rounded-full bg-black/50 px-2.5 text-xs font-semibold text-white sm:left-4 sm:top-4 sm:h-9 sm:px-3 sm:text-[13px] sm:font-medium">
        You
      </span>
      {controls && (
        <div className="absolute right-3 top-3 flex gap-2 sm:hidden">
          <button
            type="button"
            onClick={call.toggleMic}
            aria-label={call.micOn ? 'Mute microphone' : 'Unmute microphone'}
            aria-pressed={!call.micOn}
            className={`grid h-11 w-11 place-items-center rounded-full ${call.micOn ? 'bg-black/50 text-white' : 'bg-[#f4f5f7] text-night'}`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={call.toggleCamera}
            aria-label={call.cameraOn ? 'Turn camera off' : 'Turn camera on'}
            aria-pressed={!call.cameraOn}
            className={`grid h-11 w-11 place-items-center rounded-full ${call.cameraOn ? 'bg-black/50 text-white' : 'bg-[#f4f5f7] text-night'}`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <rect x="2" y="6" width="14" height="12" rx="2" />
              <path d="M16 10l6-3v10l-6-3" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
