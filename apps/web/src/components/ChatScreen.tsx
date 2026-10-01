'use client';

import type { RandomCall } from '@/lib/useRandomCall';
import { countryName, flagEmoji, GENDER_ICON, GENDER_LABEL } from '@/lib/format';
import { ChatPanel } from './ChatPanel';
import { SafetyMenu } from './SafetyMenu';
import { SettingsMenu } from './SettingsMenu';
import { VideoTile } from './VideoTile';

const STATUS_TEXT: Record<string, string> = {
  searching: 'Looking for someone to chat with…',
  connecting: 'Connecting…',
};

function PartnerBadge({ call }: { call: RandomCall }) {
  const { partner } = call;
  if (!partner) return null;
  return (
    <div className="flex items-center gap-2 rounded-full bg-black/55 px-3 py-1 text-sm text-white">
      <span title={GENDER_LABEL[partner.gender]}>{GENDER_ICON[partner.gender]}</span>
      <span>{partner.locationHidden ? '📍' : flagEmoji(partner.country)}</span>
      <span>{partner.locationHidden ? 'Location hidden' : countryName(partner.country)}</span>
      {partner.sharedInterests.length > 0 && (
        <span className="text-slate-300">· likes {partner.sharedInterests.join(', ')}</span>
      )}
    </div>
  );
}

function Searching({ call }: { call: RandomCall }) {
  const overlay = STATUS_TEXT[call.status];
  if (!overlay) return null;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-slate-600 border-t-brand" />
      <p className="text-slate-300">{overlay}</p>
      {call.status === 'searching' && call.lastLeftReason && (
        <p className="text-sm text-slate-500">Your partner left. Finding someone new.</p>
      )}
    </div>
  );
}

export function ChatScreen({ call }: { call: RandomCall }) {
  const matched = call.status === 'in-call' || call.status === 'connecting';
  const isText = call.mode === 'text';

  return (
    <main className="flex h-full flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-xl font-semibold">
          random<span className="text-brand">Call</span>
          {isText && <span className="ml-2 text-sm font-normal text-slate-400">text chat</span>}
        </span>
        {call.online !== null && <span className="text-sm text-slate-400">{call.online.toLocaleString()} online</span>}
        <button
          onClick={call.back}
          disabled={!call.canGoBack}
          title="Reconnect with the person you just skipped"
          className="rounded-lg bg-brand px-4 py-2 font-semibold hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          Back
        </button>
        <button onClick={call.next} className="rounded-lg bg-brand px-5 py-2 font-semibold hover:bg-brand-dark">
          Next
        </button>
        <button onClick={call.stop} className="rounded-lg bg-slate-600 px-5 py-2 font-semibold hover:bg-slate-500">
          Stop
        </button>
        <SettingsMenu call={call} />
      </div>

      {call.notice && (
        <p role="status" className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
          {call.notice}
        </p>
      )}

      {isText ? (
        <div className="relative flex min-h-0 flex-1 flex-col gap-2">
          <div className="relative flex min-h-8 items-center justify-between">
            <PartnerBadge call={call} />
            <SafetyMenu call={call} />
          </div>
          <div className="relative min-h-0 flex-1">
            <ChatPanel
              className="h-full"
              messages={call.messages}
              partnerTyping={call.partnerTyping}
              enabled={matched}
              onSend={call.sendMessage}
              onTyping={call.notifyTyping}
            />
            {!matched && (
              <div className="pointer-events-none absolute inset-0 rounded-xl bg-ink/80">
                <Searching call={call} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
          <div className="grid min-h-0 grid-cols-2 gap-3 lg:grid-cols-1 lg:grid-rows-2">
            <VideoTile
              stream={matched ? call.remoteStream : null}
              videoRef={call.setPartnerVideo}
              className="aspect-[3/4] sm:aspect-video lg:aspect-auto"
              videoClassName={`transition-[filter] duration-700 ${
                call.partnerHidden || call.aiHidden ? 'blur-3xl brightness-50' : call.blurPartner ? 'blur-xl' : ''
              }`}
            >
              <Searching call={call} />
              {matched && (call.partnerHidden || call.aiHidden) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                  <p className="font-medium">{call.aiHidden ? 'Video hidden: it may contain nudity' : 'Partner video hidden'}</p>
                  <button onClick={call.togglePartnerHidden} className="rounded-full bg-black/60 px-4 py-1.5 text-sm hover:bg-black/80">
                    Show anyway
                  </button>
                </div>
              )}
              <div className="absolute left-2 top-2">
                <PartnerBadge call={call} />
              </div>
              <div className="absolute right-2 top-2">
                <SafetyMenu call={call} />
              </div>
            </VideoTile>

            <VideoTile stream={call.localStream} muted mirrored className="aspect-[3/4] sm:aspect-video lg:aspect-auto">
              {!call.cameraOn && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400">Camera off</div>
              )}
              <div className="absolute bottom-2 right-2 flex gap-2">
                <button
                  onClick={call.toggleCamera}
                  aria-pressed={!call.cameraOn}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${call.cameraOn ? 'bg-black/55' : 'bg-red-600'}`}
                >
                  {call.cameraOn ? 'Camera on' : 'Camera off'}
                </button>
                <button
                  onClick={call.toggleMic}
                  aria-pressed={!call.micOn}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${call.micOn ? 'bg-black/55' : 'bg-red-600'}`}
                >
                  {call.micOn ? 'Mic on' : 'Mic off'}
                </button>
              </div>
            </VideoTile>
          </div>

          <ChatPanel
            className="h-72 lg:h-auto"
            messages={call.messages}
            partnerTyping={call.partnerTyping}
            enabled={matched}
            onSend={call.sendMessage}
            onTyping={call.notifyTyping}
          />
        </div>
      )}
    </main>
  );
}
