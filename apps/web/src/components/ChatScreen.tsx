'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { NO_FILTERS } from '@rc/shared';
import { useAuth } from '@/lib/auth';
import { countryName, flagEmoji, GENDER_ICON, GENDER_LABEL } from '@/lib/format';
import { loadSettings } from '@/lib/settings';
import type { RandomCall } from '@/lib/useRandomCall';
import { AdSlot } from './AdSlot';
import { BackIcon, MicIcon, MicOffIcon, VideoIcon, VideoOffIcon } from './icons';
import { FilterBar } from './FilterBar';
import { PlusUpsell } from './PlusUpsell';
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
    <div className="flex max-w-[70vw] items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white sm:max-w-none sm:gap-2 sm:px-3 sm:text-sm">
      <span title={GENDER_LABEL[partner.gender]}>{GENDER_ICON[partner.gender]}</span>
      <span>{partner.locationHidden ? '📍' : flagEmoji(partner.country)}</span>
      <span className="truncate">{partner.locationHidden ? 'Hidden' : countryName(partner.country)}</span>
      {partner.plus && (
        <span title="Plus member" aria-label="Plus member">
          👑
        </span>
      )}
      {partner.sharedInterests.length > 0 && (
        <span className="hidden truncate text-slate-300 md:inline">· likes {partner.sharedInterests.join(', ')}</span>
      )}
    </div>
  );
}

function Searching({ call }: { call: RandomCall }) {
  const overlay = STATUS_TEXT[call.status];
  if (!overlay) return null;
  return (
    <div className="flex flex-col items-center justify-start gap-2 p-4 text-center">
      <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-slate-600 border-t-brand" />
      <p className="text-slate-300">{overlay}</p>
      {call.status === 'searching' && call.lastLeftReason && (
        <p className="text-sm text-slate-500">Your partner left. Finding someone new.</p>
      )}
      {call.searchingLong && <WidenSearch />}
    </div>
  );
}

/** Shown when filtered searching takes a while. */
function WidenSearch() {
  const { saveSettings } = useAuth();
  return (
    <div className="pointer-events-auto text-sm text-slate-300">
      It may take longer to find someone with your filters.{' '}
      <button
        className="font-medium text-white underline"
        onClick={() => void saveSettings({ ...loadSettings(), filters: { ...NO_FILTERS } })}
      >
        Connect to anyone instead
      </button>
    </div>
  );
}

const roundBtn = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-lg transition sm:h-12 sm:w-12';

export function ChatScreen({ call }: { call: RandomCall }) {
  const matched = call.status === 'in-call' || call.status === 'connecting';
  const isText = call.mode === 'text';
  const { user } = useAuth();
  const isPlus = !!user?.plus.active;
  const { setAdFree } = call;
  const showAd = call.adBreak && !isPlus;

  useEffect(() => setAdFree(isPlus), [isPlus, setAdFree]);

  const chat = (className: string) => (
    <ChatPanel
      className={className}
      messages={call.messages}
      partnerTyping={call.partnerTyping}
      enabled={matched}
      onSend={call.sendMessage}
      onTyping={call.notifyTyping}
    />
  );

  return (
    <main className="mx-auto flex h-full max-w-6xl flex-col p-2 sm:p-4">
      <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-3xl bg-[#0f172a] p-3 sm:gap-4 sm:p-5">
        {/* Header: logo · online · settings · upgrade */}
        <header className="flex items-center gap-2 sm:gap-3">
          <span className="mr-auto text-xl font-semibold sm:text-2xl">
            random<span className="text-brand">Call</span>
            {isText && <span className="ml-2 text-sm font-normal text-slate-400">text chat</span>}
          </span>
          {call.online !== null && (
            <span className="hidden text-sm leading-tight text-slate-400 sm:block">{call.online.toLocaleString()} online</span>
          )}
          <SettingsMenu call={call} />
          {isPlus ? (
            <span className="text-sm font-semibold text-amber-300">👑 Plus</span>
          ) : (
            <Link href="/plus" className="rounded-xl bg-amber-500 px-4 py-2 font-semibold text-white hover:bg-amber-600">
              Upgrade
            </Link>
          )}
        </header>

        <FilterBar />

        {call.plusRequired && <PlusUpsell onClose={call.dismissPlusRequired} reason="Filters are a Plus feature" />}
        {call.notice && (
          <p role="status" className="rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900">
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
              {chat('h-full')}
              {(!matched || showAd) && (
                <div className="absolute inset-0 overflow-hidden rounded-xl bg-ink/90">
                  {showAd ? (
                    <AdSlot placement="break" refreshKey={call.adKey} className="h-full rounded-none" />
                  ) : (
                    <div className="pointer-events-none">
                      <Searching call={call} />
                    </div>
                  )}
                </div>
              )}
              <div className="absolute bottom-16 left-0 right-0 z-20 flex justify-center gap-3">
                <button onClick={call.stop} className="rounded-full bg-red-500 px-6 py-2.5 font-semibold text-white shadow-lg hover:bg-red-600">
                  Stop
                </button>
                <button onClick={call.next} className="rounded-full bg-brand px-6 py-2.5 font-semibold text-white shadow-lg hover:bg-brand-dark">
                  Next
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            {/* Stage: partner video, your picture-in-picture, controls */}
            <VideoTile
              stream={matched ? call.remoteStream : null}
              videoRef={call.setPartnerVideo}
              forceVisible={call.relayActive}
              className="aspect-[4/5] rounded-2xl !bg-[#1e293b] sm:aspect-video lg:aspect-auto lg:min-h-[420px]"
              videoClassName={`transition-[filter] duration-700 ${
                call.partnerHidden || call.aiHidden ? 'blur-3xl brightness-50' : call.blurPartner ? 'blur-xl' : ''
              }`}
            >
              {!matched && !showAd && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-500">
                  <VideoIcon className="h-16 w-16 sm:h-20 sm:w-20" />
                </div>
              )}
              <div className="absolute inset-0 top-1/2">
                <Searching call={call} />
              </div>
              {matched && (call.partnerHidden || call.aiHidden) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                  <p className="font-medium">{call.aiHidden ? 'Video hidden: it may contain nudity' : 'Partner video hidden'}</p>
                  <button onClick={call.togglePartnerHidden} className="rounded-full bg-black/60 px-4 py-1.5 text-sm hover:bg-black/80">
                    Show anyway
                  </button>
                </div>
              )}

              {/* A fresh ad between strangers; the next match connects underneath. */}
              {showAd && (
                <div className="absolute inset-0 z-10">
                  <AdSlot placement="break" refreshKey={call.adKey} className="h-full rounded-none" />
                  <p className="absolute left-0 right-0 top-3 text-center text-xs text-white/80">Finding your next stranger…</p>
                </div>
              )}

              {!showAd && (
                <>
                  <div className="absolute left-3 top-3 flex flex-col items-start gap-1">
                    <PartnerBadge call={call} />
                    {call.relayActive && (
                      <span
                        className="rounded-full bg-amber-500/90 px-2 py-0.5 text-[11px] font-medium text-white"
                        title="Your networks blocked a direct connection, so video goes through our server with a short delay."
                      >
                        Relay mode · slight delay
                      </span>
                    )}
                  </div>
                  <div className="absolute right-3 top-3">
                    <SafetyMenu call={call} />
                  </div>
                </>
              )}

              {/* You (picture-in-picture) */}
              <div className="absolute bottom-20 right-3 z-20 h-36 w-28 overflow-hidden rounded-xl border-2 border-slate-500/80 bg-slate-600 shadow-xl sm:bottom-24 sm:right-4 sm:h-32 sm:w-52">
                <VideoTile stream={call.localStream} muted mirrored className="h-full w-full rounded-none !bg-slate-600" />
                {(!call.localStream || !call.cameraOn) && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-200">You</div>
                )}
              </div>

              {/* Controls */}
              <div className="absolute bottom-3 left-0 right-0 z-20 flex items-center justify-center gap-1.5 px-2 sm:bottom-4 sm:gap-3">
                <button
                  onClick={call.toggleCamera}
                  aria-label={call.cameraOn ? 'Turn camera off' : 'Turn camera on'}
                  aria-pressed={!call.cameraOn}
                  className={`${roundBtn} ${call.cameraOn ? 'bg-slate-600/90 hover:bg-slate-500' : 'bg-red-500 hover:bg-red-600'}`}
                >
                  {call.cameraOn ? <VideoIcon /> : <VideoOffIcon />}
                </button>
                <button
                  onClick={call.toggleMic}
                  aria-label={call.micOn ? 'Mute microphone' : 'Unmute microphone'}
                  aria-pressed={!call.micOn}
                  className={`${roundBtn} ${call.micOn ? 'bg-slate-600/90 hover:bg-slate-500' : 'bg-red-500 hover:bg-red-600'}`}
                >
                  {call.micOn ? <MicIcon /> : <MicOffIcon />}
                </button>
                {call.canGoBack && (
                  <button
                    onClick={call.back}
                    aria-label="Back to the previous stranger"
                    title="Back to the person you just skipped"
                    className={`${roundBtn} bg-slate-600/90 hover:bg-slate-500`}
                  >
                    <BackIcon />
                  </button>
                )}
                <button onClick={call.stop} className="shrink-0 rounded-full bg-red-500 px-5 py-2.5 font-semibold text-white shadow-lg hover:bg-red-600 sm:px-8 sm:py-3">
                  Stop
                </button>
                <button onClick={call.next} className="shrink-0 rounded-full bg-brand px-5 py-2.5 font-semibold text-white shadow-lg hover:bg-brand-dark sm:px-8 sm:py-3">
                  Next
                </button>
              </div>
            </VideoTile>

            {chat('h-56 sm:h-64 lg:h-auto lg:min-h-0')}
          </div>
        )}
      </div>
    </main>
  );
}
