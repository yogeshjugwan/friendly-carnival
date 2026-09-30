'use client';

import type { RandomCall } from '@/lib/useRandomCall';
import { countryName, flagEmoji, GENDER_ICON, GENDER_LABEL } from '@/lib/format';
import { VideoTile } from './VideoTile';

const STATUS_TEXT: Record<string, string> = {
  searching: 'Looking for someone to chat with…',
  connecting: 'Connecting…',
};

export function ChatScreen({ call }: { call: RandomCall }) {
  const { status, partner, lastLeftReason } = call;
  const overlay = STATUS_TEXT[status];

  return (
    <main className="flex h-full flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-xl font-semibold">
          random<span className="text-brand">Call</span>
        </span>
        {call.online !== null && <span className="text-sm text-slate-400">{call.online.toLocaleString()} online</span>}
        <button onClick={call.next} className="rounded-lg bg-brand px-5 py-2 font-semibold hover:bg-brand-dark">
          Next
        </button>
        <button onClick={call.stop} className="rounded-lg bg-slate-600 px-5 py-2 font-semibold hover:bg-slate-500">
          Stop
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
        <VideoTile stream={status === 'in-call' || status === 'connecting' ? call.remoteStream : null} className="min-h-64">
          {overlay && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <span className="h-10 w-10 animate-spin rounded-full border-4 border-slate-600 border-t-brand" />
              <p className="text-slate-300">{overlay}</p>
              {status === 'searching' && lastLeftReason && (
                <p className="text-sm text-slate-500">Your partner left. Finding someone new.</p>
              )}
            </div>
          )}
          {partner && (
            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1 text-sm">
              <span title={GENDER_LABEL[partner.gender]}>{GENDER_ICON[partner.gender]}</span>
              <span>{flagEmoji(partner.country)}</span>
              <span>{countryName(partner.country)}</span>
              {partner.sharedInterests.length > 0 && (
                <span className="text-slate-300">· likes {partner.sharedInterests.join(', ')}</span>
              )}
            </div>
          )}
        </VideoTile>

        <VideoTile stream={call.localStream} muted mirrored className="min-h-64">
          {!call.cameraOn && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400">Camera off</div>
          )}
          <div className="absolute bottom-3 right-3 flex gap-2">
            <button
              onClick={call.toggleCamera}
              aria-pressed={!call.cameraOn}
              className={`rounded-full px-4 py-2 text-sm font-medium ${call.cameraOn ? 'bg-black/55' : 'bg-red-600'}`}
            >
              {call.cameraOn ? 'Camera on' : 'Camera off'}
            </button>
            <button
              onClick={call.toggleMic}
              aria-pressed={!call.micOn}
              className={`rounded-full px-4 py-2 text-sm font-medium ${call.micOn ? 'bg-black/55' : 'bg-red-600'}`}
            >
              {call.micOn ? 'Mic on' : 'Mic off'}
            </button>
          </div>
        </VideoTile>
      </div>
    </main>
  );
}
