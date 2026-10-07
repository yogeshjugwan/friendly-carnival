'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NO_FILTERS, TOPICS } from '@rc/shared';
import { useAuth } from '@/lib/auth';
import { countryName, flagEmoji, GENDER_ICON, GENDER_LABEL } from '@/lib/format';
import { loadSettings } from '@/lib/settings';
import type { RandomCall } from '@/lib/useRandomCall';
import { AdSlot } from './AdSlot';
import { DraggablePip, type Corner } from './DraggablePip';
import { VideoIcon } from './icons';
import { CallControls, ReactionLayer } from './CallControls';
import { FilterBar } from './FilterBar';
import { LimitModal } from './LimitModal';
import { CoinChip, GiftButton, GiftLayer } from './Coins';
import { FriendButton, FriendsPanel } from './Friends';
import { IncomingCallModal, OnlineUsersPanel } from './OnlineUsers';
import { PlusUpsell } from './PlusUpsell';
import { ChatPanel } from './ChatPanel';
import { SafetyMenu } from './SafetyMenu';
import { SettingsMenu } from './SettingsMenu';
import { VideoTile } from './VideoTile';
import { VerifiedBadge } from './VerifiedBadge';
import { VoiceStage } from './VoiceStage';
import { GameCard, GamesButton } from './Games';

const STATUS_TEXT: Record<string, string> = {
  searching: 'Looking for someone to chat with…',
  connecting: 'Connecting…',
};

/** Meet-style clock in the bottom bar. */
function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  return <span className="tabular-nums">{now ? now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</span>;
}

function PartnerBadge({ call }: { call: RandomCall }) {
  const { partner } = call;
  if (!partner) return null;
  return (
    <div className="flex max-w-[70vw] items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white sm:max-w-none sm:gap-2 sm:px-3 sm:text-sm">
      <span title={GENDER_LABEL[partner.gender]}>{GENDER_ICON[partner.gender]}</span>
      <span>{partner.locationHidden ? '📍' : flagEmoji(partner.country)}</span>
      <span className="truncate">{partner.locationHidden ? 'Hidden' : countryName(partner.country)}</span>
      {partner.verified && <VerifiedBadge />}
      {partner.plus && (
        <span title="Plus member" aria-label="Plus member">
          👑
        </span>
      )}
      {partner.isNew && (
        <span title="Joined in the last day" className="rounded-full bg-amber-500/80 px-2 py-0.5 text-[11px] font-semibold text-black">
          New
        </span>
      )}
      {partner.topic && (
        <span className="rounded-full bg-brand/80 px-2 py-0.5 text-[11px] font-semibold text-white">
          {TOPICS.find((t) => t.id === partner.topic)?.emoji} #{TOPICS.find((t) => t.id === partner.topic)?.label}
        </span>
      )}
      {partner.sharedInterests.length > 0 && (
        <span className="hidden truncate text-slate-300 md:inline">· likes {partner.sharedInterests.join(', ')}</span>
      )}
    </div>
  );
}

function Searching({ call }: { call: RandomCall }) {
  if (call.status === 'browsing') {
    return (
      <p className="max-w-xs text-center text-sm text-slate-300 sm:text-base">
        Pick someone from <span className="font-semibold text-white">👥 Online</span> to call, or press{' '}
        <span className="font-semibold text-white">Next</span> for a random stranger.
      </p>
    );
  }
  const overlay = STATUS_TEXT[call.status];
  if (!overlay) return null;
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <p className="flex items-center gap-2 text-sm text-slate-300 sm:text-base">
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-600 border-t-brand" />
        {overlay}
      </p>
      {call.status === 'searching' && call.lastLeftReason && (
        <p className="text-xs text-slate-500 sm:text-sm">Your partner left. Finding someone new.</p>
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


export function ChatScreen({ call }: { call: RandomCall }) {
  const matched = call.status === 'in-call' || call.status === 'connecting';
  const isText = call.mode === 'text';
  const isVoice = call.mode === 'voice';
  const { user } = useAuth();
  const isPlus = !!user?.plus.active;
  const showAd = call.adBreak && !isPlus;
  const [showOnline, setShowOnline] = useState(false);
  // Meet-style chat: closed by default; a side panel on desktop, a sheet over the video on phones.
  const [chatOpen, setChatOpen] = useState(false);
  // Partner messages seen while the chat was open; the rest show as a badge.
  const theirCount = call.messages.filter((m) => m.from === 'them').length;
  const [seen, setSeen] = useState(0);
  useEffect(() => {
    if (chatOpen || theirCount < seen) setSeen(theirCount);
  }, [chatOpen, theirCount, seen]);
  const unread = Math.max(0, theirCount - seen);
  // Adjust view: fill the tile (cropped) or fit the whole picture.
  const [fit, setFit] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void mainRef.current?.requestFullscreen?.().catch(() => undefined);
  }, []);
  const [onlineUpsell, setOnlineUpsell] = useState(false);
  const closeOnline = useCallback(() => setShowOnline(false), []);
  const [showFriends, setShowFriends] = useState(false);
  const closeFriends = useCallback(() => setShowFriends(false), []);
  // One side panel at a time, like Meet: Online now, Friends or Chat.
  const openOnline = useCallback(() => {
    setChatOpen(false);
    setShowFriends(false);
    setShowOnline(true);
  }, []);
  const toggleFriends = useCallback(() => {
    setChatOpen(false);
    setShowOnline(false);
    setShowFriends((o) => !o);
  }, []);
  const toggleChat = useCallback(() => {
    setShowOnline(false);
    setShowFriends(false);
    setChatOpen((o) => !o);
  }, []);
  const sideOpen = chatOpen || showOnline || showFriends;
  // "See who's online" from the home page opens the list straight away.
  useEffect(() => {
    if (call.status !== 'browsing') return;
    if (call.browseFor === 'friends') {
      setChatOpen(false);
      setShowOnline(false);
      setShowFriends(true);
    } else openOnline();
  }, [call.status, call.browseFor, openOnline]);
  const [pipCorner, setPipCorner] = useState<Corner>('br');
  const pipOnTop = pipCorner[0] === 't';


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
    // Full-screen dark call view, like Google Meet.
    <main ref={mainRef} className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#202124] px-2 pb-2 pt-2 sm:px-4 sm:pb-4 sm:pt-3">
      <div className="flex min-h-0 flex-1 flex-col gap-2 sm:gap-3 [@media(max-height:500px)]:gap-1.5">
        {/* Header: logo · online · settings · upgrade */}
        <header className="flex items-center gap-2 sm:gap-3">
          <span className="text-xl font-semibold sm:text-2xl [@media(max-height:500px)]:text-lg">
            random<span className="text-brand">Call</span>
            {isText && <span className="ml-2 text-sm font-normal text-slate-400">text chat</span>}
            {isVoice && <span className="ml-2 text-sm font-normal text-slate-400">voice call</span>}
          </span>
          {/* Filters share the header row on wide and short screens; phones get their own row below. */}
          <div className="mr-auto hidden sm:block [@media(max-height:500px)]:block">
            <FilterBar />
          </div>
          <span className="mr-auto sm:hidden [@media(max-height:500px)]:hidden" aria-hidden />
          <button
            onClick={toggleFriends}
            aria-pressed={showFriends}
            title="Friends"
            className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition ${showFriends ? 'bg-pink-200 text-slate-900' : 'bg-[#3c4043] text-slate-100 hover:bg-[#4a4e52]'}`}
          >
            <span aria-hidden>❤️</span>
            <span className="hidden sm:inline">Friends</span>
          </button>
          {/* Online count and the Online list are Plus-only. */}
          <button
            onClick={() => (isPlus ? (showOnline ? closeOnline() : openOnline()) : setOnlineUpsell(true))}
            className={`flex items-center gap-1.5 rounded-full bg-[#3c4043] px-3 py-2 text-sm font-medium text-slate-100 hover:bg-[#4a4e52]`}
            title={isPlus ? 'See who is online and call them' : 'See who is online (Plus)'}
          >
            <span aria-hidden>👥</span>
            {isPlus && call.online !== null ? (
              <span>
                {Math.max(0, call.online - 1).toLocaleString()}
                <span className="hidden sm:inline"> online</span>
              </span>
            ) : (
              <span>
                <span className="hidden sm:inline">Online </span>👑
              </span>
            )}
          </button>
          <CoinChip call={call} className="max-sm:hidden" />
          {/* Video calls have settings under ⋮ in the call bar. */}
          {isText && <SettingsMenu call={call} />}
          {isPlus ? (
            <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-sm font-semibold text-amber-300" title="Your Plus membership">👑 Plus member</span>
          ) : (
            <Link href="/plus" className="rounded-full bg-amber-500 px-4 py-2 font-semibold text-white hover:bg-amber-600">
              Upgrade
            </Link>
          )}
        </header>

        <div className="sm:hidden [@media(max-height:500px)]:hidden">
          <FilterBar />
        </div>

        <LimitModal call={call} />
        <IncomingCallModal call={call} />
        {/* Text chat has no side column, so the list floats on the right there. */}
        {showOnline && isText && <OnlineUsersPanel call={call} onClose={closeOnline} className="fixed inset-y-2 right-2 z-40 w-[min(24rem,95vw)] shadow-2xl" />}
        {showFriends && isText && <FriendsPanel call={call} onClose={closeFriends} className="fixed inset-y-2 right-2 z-40 w-[min(24rem,95vw)] shadow-2xl" />}
        {onlineUpsell && <PlusUpsell onClose={() => setOnlineUpsell(false)} reason="See who is online and call them with Plus" />}
        {!isPlus && call.limit && !call.limit.unlimited && call.limit.remaining <= 5 && call.status !== 'limited' && (
          <p className="-mt-1 text-xs text-amber-300">
            {call.limit.remaining === 0 ? 'No free matches left today.' : `${call.limit.remaining} free match${call.limit.remaining === 1 ? '' : 'es'} left today.`}{' '}
            <Link href="/plus" className="font-semibold underline">
              Get unlimited
            </Link>
          </p>
        )}
        {call.plusRequired && <PlusUpsell onClose={call.dismissPlusRequired} reason="Filters are a Plus feature" />}
        {call.notice && (
          <p role="status" className="rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900">
            {call.notice}
          </p>
        )}

        {isText ? (
          <div className="relative flex min-h-0 flex-1 flex-col gap-2">
            <div className="relative flex min-h-8 items-center justify-between">
              <div className="flex items-center gap-2">
                <PartnerBadge call={call} />
                {matched && <FriendButton call={call} />}
                {matched && <GiftButton call={call} />}
                {matched && <GamesButton call={call} />}
              </div>
              <SafetyMenu call={call} />
            </div>
            <div className="relative min-h-0 flex-1">
              {chat('h-full')}
              {matched && call.game && (
                <div className="absolute inset-x-0 top-2 z-20 flex justify-center px-2">
                  <GameCard call={call} />
                </div>
              )}
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
          <div
            className={`grid min-h-0 flex-1 grid-rows-1 gap-3 sm:gap-4 ${
              sideOpen ? 'lg:grid-cols-[minmax(0,1fr)_360px] max-lg:landscape:grid-cols-[minmax(0,1fr)_minmax(15rem,42%)]' : ''
            }`}
          >
            {/* Stage: partner video, your picture-in-picture, controls */}
            <VideoTile
              stream={matched ? call.remoteStream : null}
              videoRef={call.setPartnerVideo}
              forceVisible={call.relayActive}
              className="min-h-0 rounded-2xl !bg-[#2d2e31]"
              videoClassName={`transition-[filter] duration-700 ${fit ? '!object-contain' : ''} ${
                call.partnerHidden || call.aiHidden ? 'blur-3xl brightness-50' : call.blurPartner ? 'blur-xl' : ''
              }`}
            >
              {!matched && !showAd && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-500 max-lg:landscape:hidden">
                  <VideoIcon className="h-16 w-16 sm:h-20 sm:w-20" />
                </div>
              )}
              {isVoice && !showAd && (
                <VoiceStage call={call} matched={matched} partnerEmoji={call.partner ? GENDER_ICON[call.partner.gender] : '🙂'} />
              )}
              <div className={`absolute inset-x-0 flex justify-center px-4 ${pipOnTop ? 'bottom-4' : 'top-14'}`}>
                <Searching call={call} />
              </div>
              {matched && (call.partnerHidden || call.aiHidden) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                  <p className="font-medium">
                    {call.aiHidden
                      ? 'Video hidden: it may contain nudity'
                      : call.partner?.isNew
                        ? 'New user — video hidden for your safety'
                        : 'Partner video hidden'}
                  </p>
                  <button onClick={call.togglePartnerHidden} className="rounded-full bg-black/60 px-4 py-1.5 text-sm hover:bg-black/80">
                    Show anyway
                  </button>
                </div>
              )}

              {/* A fresh ad between strangers; the next match connects underneath. */}
              {showAd && (
                <div className="absolute inset-0 z-10">
                  <AdSlot placement="break" refreshKey={call.adKey} className="h-full rounded-none" />
                  <p className="absolute left-0 right-0 top-3 text-center text-xs text-white/80">Your next stranger is right after this ad</p>
                </div>
              )}

              {!showAd && (
                <>
                  <div className="absolute left-3 top-3 flex flex-col items-start gap-1">
                    <PartnerBadge call={call} />
                    {matched && (
                      <div className="flex gap-1.5">
                        <FriendButton call={call} />
                        <GiftButton call={call} />
                        <GamesButton call={call} />
                      </div>
                    )}
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

              {/* You (picture-in-picture): drag it to any corner; voice calls have no picture */}
              {!isVoice && (
                <DraggablePip onCornerChange={setPipCorner} className="aspect-[3/4] h-[24%] max-h-[10rem] min-h-[5rem] max-w-[36%] sm:h-[30%] sm:max-h-[12rem] overflow-hidden rounded-xl border-2 border-slate-500/80 bg-slate-600 shadow-xl md:aspect-video landscape:aspect-video max-lg:landscape:h-[34%] lg:h-[26%] [@media(max-height:500px)]:h-[30%] [@media(max-height:500px)]:min-h-[3.5rem]">
                  <VideoTile stream={call.localStream} muted mirrored className="pointer-events-none h-full w-full rounded-none !bg-slate-600" />
                  {(!call.localStream || !call.cameraOn) && (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-200">You</div>
                  )}
                </DraggablePip>
              )}

              {call.noFace && (
                <div className="absolute inset-x-0 bottom-3 z-20 flex justify-center px-3" role="status">
                  <p className="rounded-full bg-amber-500/90 px-4 py-1.5 text-sm font-medium text-white shadow-lg">
                    🙂 We can&apos;t see your face — look at the camera so people don&apos;t skip you
                  </p>
                </div>
              )}
              <ReactionLayer call={call} />
              <GiftLayer call={call} />
              {matched && call.game && (
                <div className="absolute inset-x-0 bottom-3 z-20 flex justify-center px-3 lg:inset-x-auto lg:left-3">
                  <GameCard call={call} />
                </div>
              )}
              {call.icebreaker && matched && (
                <div className="absolute inset-x-3 top-24 z-20 flex justify-center sm:top-20">
                  <div className="w-full max-w-md rounded-2xl bg-black/70 px-4 py-3 text-center text-white shadow-xl backdrop-blur" role="status">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">🎲 Icebreaker</p>
                    <p className="mt-1 text-base font-medium sm:text-lg">{call.icebreaker.text}</p>
                    <div className="mt-2 flex justify-center gap-2 text-xs">
                      <button onClick={call.askIcebreaker} className="rounded-full bg-white/15 px-3 py-1 hover:bg-white/25">
                        Another one
                      </button>
                      <button onClick={call.dismissIcebreaker} className="rounded-full px-3 py-1 text-white/70 hover:text-white">
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </VideoTile>

            {showOnline && <OnlineUsersPanel call={call} onClose={closeOnline} className="h-full shadow-2xl max-lg:portrait:fixed max-lg:portrait:inset-x-2 max-lg:portrait:bottom-2 max-lg:portrait:top-[38%] max-lg:portrait:z-40 max-lg:portrait:h-auto" />}
            {showFriends && <FriendsPanel call={call} onClose={closeFriends} className="h-full shadow-2xl max-lg:portrait:fixed max-lg:portrait:inset-x-2 max-lg:portrait:bottom-2 max-lg:portrait:top-[38%] max-lg:portrait:z-40 max-lg:portrait:h-auto" />}
            {chatOpen && (
              <ChatPanel
                variant="meet"
                autoFocus
                onIcebreaker={matched ? call.askIcebreaker : undefined}
                canAutoTranslate={isPlus}
                onClose={() => setChatOpen(false)}
                messages={call.messages}
                partnerTyping={call.partnerTyping}
                enabled={matched}
                onSend={call.sendMessage}
                onTyping={call.notifyTyping}
                // Desktop and sideways phones: a column beside the video. Upright phones/tablets:
                // a sheet over the lower video.
                className="h-full shadow-2xl max-lg:portrait:fixed max-lg:portrait:inset-x-2 max-lg:portrait:bottom-2 max-lg:portrait:top-[38%] max-lg:portrait:z-40 max-lg:portrait:h-auto"
              />
            )}
          </div>
        )}

        {/* Meet-style bottom bar under the video: clock | your name · controls */}
        {!isText && (
          <div className="grid shrink-0 grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
            <div className="hidden items-center gap-3 truncate pl-1 text-[15px] text-slate-200 sm:flex">
              <Clock />
              <span className="text-slate-500">|</span>
              <span className="truncate" title={user ? user.email : 'Not logged in'}>{user ? user.email.split('@')[0] : 'Guest'}</span>
            </div>
            <div className="flex justify-center">
              <CallControls
                call={call}
                matched={matched}
                chatOpen={chatOpen}
                onToggleChat={toggleChat}
                unread={unread}
                fit={fit}
                onToggleFit={() => setFit((f) => !f)}
                onToggleFullscreen={toggleFullscreen}
              />
            </div>
            {/* Keeps the controls centred, like Meet. */}
            <div className="hidden sm:block" aria-hidden />
          </div>
        )}
      </div>
    </main>
  );
}
