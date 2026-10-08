'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NO_FILTERS, PRIORITY_MATCH, TOPICS } from '@rc/shared';
import { useAuth } from '@/lib/auth';
import { countryName, flagEmoji, GENDER_ICON, GENDER_LABEL } from '@/lib/format';
import { loadSettings } from '@/lib/settings';
import type { RandomCall } from '@/lib/useRandomCall';
import { AdSlot } from './AdSlot';
import { DraggablePip, type Corner } from './DraggablePip';
import { CallControls, ReactionLayer, StopNext } from './CallControls';
import { FilterBar } from './FilterBar';
import { LimitModal } from './LimitModal';
import { GiftButton, GiftLayer, spendError } from './Coins';
import { FriendButton, FriendsPanel } from './Friends';
import { IncomingCallModal, OnlineUsersPanel } from './OnlineUsers';
import { PlusUpsell } from './PlusUpsell';
import { ChatPanel } from './ChatPanel';
import { ReportButton, SafetyMenu } from './SafetyMenu';
import { AccountMenu, Brand } from './SiteHeader';
import { SettingsMenu } from './SettingsMenu';
import { VideoTile } from './VideoTile';
import { VerifiedBadge } from './VerifiedBadge';
import { VoiceStage } from './VoiceStage';
import { GameCard, GamesButton } from './Games';
import { DailyRewardChip } from './DailyReward';
import { useI18n, type TKey } from '@/lib/i18n';
import { CAMERA_PROBLEM } from '@/lib/cameraCheck';

const STATUS_TEXT: Record<string, TKey> = {
  searching: 'status.searching',
  connecting: 'status.connecting',
};

function PartnerBadge({ call }: { call: RandomCall }) {
  const { partner } = call;
  if (!partner) return null;
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex max-w-[70vw] items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white sm:max-w-none sm:gap-2 sm:px-3 sm:text-sm">
        {partner.avatar && <span className="text-base sm:text-lg">{partner.avatar}</span>}
        {partner.name && <span className="max-w-[8rem] truncate font-semibold">{partner.name}</span>}
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
      {partner.bio && (
        <p className="max-w-[70vw] truncate rounded-full bg-black/45 px-2.5 py-0.5 text-xs italic text-slate-200 sm:max-w-sm">“{partner.bio}”</p>
      )}
    </div>
  );
}

function Searching({ call }: { call: RandomCall }) {
  const { t } = useI18n();
  if (call.status === 'browsing') {
    return (
      <p className="max-w-xs text-center text-sm text-slate-300 sm:text-base">
        Pick someone from <span className="font-semibold text-white">👥 Online</span> to call, or press{' '}
        <span className="font-semibold text-white">Next</span> for a random stranger.
      </p>
    );
  }
  const overlayKey = STATUS_TEXT[call.status];
  const overlay = overlayKey ? t(overlayKey) : null;
  if (!overlay) return null;
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <p className="flex items-center gap-2 text-sm text-slate-300 sm:text-base">
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-600 border-t-brand" />
        {overlay}
      </p>
      {call.status === 'searching' && call.lastLeftReason && (
        <p className="text-xs text-slate-500 sm:text-sm">{t('status.partnerLeft')}</p>
      )}
      {call.searchingLong && <WidenSearch />}
      {call.status === 'searching' && <PriorityButton call={call} />}
    </div>
  );
}

/** ⭐ Pay a few coins to meet a verified person next. */
function PriorityButton({ call }: { call: RandomCall }) {
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;
  if (call.priorityOn) return <p className="text-sm text-gold">Looking for a ✓ Verified person for you…</p>;
  return (
    <div className="pointer-events-auto mt-1 flex flex-col items-center">
      <button
        onClick={async () => {
          setError(null);
          const r = await call.buyPriority();
          setError(spendError(r));
        }}
        className="flex items-center gap-3 rounded-[14px] border border-[#3a3418] bg-[#1b1a10] py-2 pl-4 pr-2 text-left text-gold transition hover:border-[#4a4220]"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
        <span className="text-sm font-semibold">Meet a verified person next</span>
        <span className="flex h-8 items-center rounded-[9px] bg-gold px-3 text-[13px] font-bold text-[#1a1608]">{PRIORITY_MATCH.coins} coins</span>
      </button>
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
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


/** "Finding someone for you…" on the video stage: pulse rings, what you're matching on, Priority. */
function SearchingStage({ call }: { call: RandomCall }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [matching, setMatching] = useState('');
  useEffect(() => {
    const s = loadSettings();
    const f = user?.plus.active ? s.filters : NO_FILTERS;
    let topic: string | null = null;
    try {
      topic = window.localStorage.getItem('rc.topic');
    } catch {
      /* ignore */
    }
    const who = f.gender === 'any' ? 'anyone' : f.gender === 'female' ? 'girls' : f.gender === 'male' ? 'boys' : 'couples';
    const parts = [
      f.verifiedOnly ? `✓ verified ${who}` : who,
      f.country !== 'any' ? countryName(f.country) : null,
      topic ? t(`topic.${topic}` as TKey) : null,
    ].filter(Boolean);
    setMatching(parts.join(' · '));
  }, [user, call.status, t]);

  if (call.status === 'browsing') {
    return (
      <p className="max-w-xs px-4 text-center text-sm text-mute sm:text-base">
        Pick someone from <span className="font-semibold text-white">Online</span> or <span className="font-semibold text-white">Friends</span> to call,
        or press <span className="font-semibold text-white">Next</span> for a random stranger.
      </p>
    );
  }
  if (call.status !== 'searching' && call.status !== 'connecting') return null;
  return (
    <div className="flex flex-col items-center gap-5 px-4 text-center sm:gap-7">
      <div className="relative flex h-36 w-36 items-center justify-center sm:h-[200px] sm:w-[200px]" aria-hidden>
        <span className="rc-pulse absolute inset-0 rounded-full border-2 border-lime" />
        <span className="rc-pulse-late absolute inset-0 rounded-full border-2 border-lime" />
        <span className="flex h-20 w-20 items-center justify-center rounded-full border border-[#2b3243] bg-[#1a1f2c] sm:h-24 sm:w-24">
          <svg viewBox="0 0 24 24" className="h-9 w-9 sm:h-10 sm:w-10" fill="none" stroke="#c6f432" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 10l5-3v10l-5-3z" />
            <rect x="3" y="6" width="12" height="12" rx="2" />
          </svg>
        </span>
      </div>
      <div className="flex flex-col items-center gap-2.5">
        <h1 className="m-0 font-display text-2xl font-bold tracking-[-0.02em] text-[#f4f6fa] sm:text-[28px]" role="status">
          {call.status === 'connecting' ? t('status.connecting') : t('status.searching')}
        </h1>
        {call.status === 'searching' && call.lastLeftReason ? (
          <p className="m-0 text-sm text-mute">{t('status.partnerLeft')}</p>
        ) : (
          matching && <p className="m-0 text-sm text-mute">Matching: {matching}</p>
        )}
      </div>
      {call.searchingLong && <WidenSearch />}
      {call.status === 'searching' && <PriorityButton call={call} />}
    </div>
  );
}

/** Who you're talking to: name · country, what you share, and Add friend / Gift / Play. */
function PartnerCard({ call }: { call: RandomCall }) {
  const p = call.partner;
  if (!p) return null;
  const where = p.locationHidden ? 'Location hidden' : p.country ? `${flagEmoji(p.country)} ${countryName(p.country)}` : '';
  const topic = p.topic ? TOPICS.find((x) => x.id === p.topic) : null;
  const line = p.sharedInterests.length
    ? `You both like ${p.sharedInterests.join(', ')}`
    : topic
      ? `You're both in ${topic.emoji} ${topic.label}`
      : p.bio
        ? `“${p.bio}”`
        : null;
  return (
    <div className="flex max-w-[calc(100vw-7rem)] flex-wrap items-center gap-2.5 sm:max-w-[calc(100vw-2.5rem)] rounded-[14px] border border-line-2 bg-night/80 py-2 pl-3.5 pr-2 backdrop-blur sm:flex-nowrap [&_button]:whitespace-nowrap">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold text-[#f4f6fa]">
          {p.avatar && <span aria-hidden>{p.avatar}</span>}
          <span className="truncate">
            {p.name || (
              <span title={GENDER_LABEL[p.gender]} aria-label={GENDER_LABEL[p.gender]}>
                {GENDER_ICON[p.gender]} Stranger
              </span>
            )}
            {where && <span className="font-normal text-mute"> · {where}</span>}
          </span>
          {p.verified && <VerifiedBadge />}
          {p.plus && (
            <span title="Plus member" aria-label="Plus member">
              👑
            </span>
          )}
          {p.isNew && <span className="rounded bg-gold px-1.5 text-[10px] font-bold text-[#1a1608]">NEW</span>}
        </span>
        {line && <span className="truncate text-xs text-lime">{line}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <FriendButton call={call} />
        <GiftButton call={call} />
        <GamesButton call={call} />
      </span>
    </div>
  );
}

/** mm:ss since the match started (00:00 between matches). */
function CallTimer({ since }: { since: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [since]);
  const s = since ? Math.max(0, Math.floor((now - since) / 1000)) : 0;
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return (
    <span className="font-medium tabular-nums text-[#e8ebf2]" aria-label="Call length">
      {h ? `${h}:` : ''}
      {mm}:{ss}
    </span>
  );
}

export function ChatScreen({ call }: { call: RandomCall }) {
  const { t } = useI18n();
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
  // Space = Next (like the button says), unless you're typing.
  const nextRef = useRef(call.next);
  nextRef.current = call.next;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.tagName === 'BUTTON' || el.isContentEditable)) return;
      if (call.mode === 'text' || !['searching', 'in-call', 'connecting', 'browsing'].includes(call.status)) return;
      e.preventDefault();
      nextRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [call.mode, call.status]);
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
    <main ref={mainRef} className="flex h-[100dvh] w-full flex-col overflow-hidden bg-night px-2 pb-2 pt-2 sm:px-5 sm:pb-5 sm:pt-3">
      <div className="flex min-h-0 flex-1 flex-col gap-2 sm:gap-3 [@media(max-height:500px)]:gap-1.5">
        {/* Header: logo · online · settings · upgrade */}
        <header className="flex items-center gap-2 sm:gap-3">
          <span className="flex items-center gap-2">
            <span className="sm:hidden">
              <Brand compact />
            </span>
            <span className="max-sm:hidden">
              <Brand compact />
            </span>
            {isText && <span className="text-sm text-dim max-md:hidden">text chat</span>}
            {isVoice && <span className="text-sm text-dim max-md:hidden">voice call</span>}
          </span>
          {/* Filters share the header row on wide and short screens; phones get their own row below. */}
          <div className="ml-2 mr-auto hidden min-w-0 sm:block [@media(max-height:500px)]:block">
            <FilterBar />
          </div>
          <span className="mr-auto sm:hidden [@media(max-height:500px)]:hidden" aria-hidden />
          <button
            onClick={toggleFriends}
            aria-pressed={showFriends}
            title="Friends"
            className={`flex h-10 items-center gap-2 rounded-[10px] border px-3 text-sm transition sm:px-3.5 ${showFriends ? 'border-[#ff7aa8] bg-[#2a1520] text-[#ffd0e0]' : 'border-line bg-card text-[#e8ebf2] hover:border-line-2'}`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="#ff7aa8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
            </svg>
            <span className="hidden sm:inline">Friends</span>
          </button>
          {/* Online count and the Online list are Plus-only. */}
          <button
            onClick={() => (isPlus ? (showOnline ? closeOnline() : openOnline()) : setOnlineUpsell(true))}
            aria-pressed={showOnline}
            className={`flex h-10 items-center gap-2 rounded-[10px] border px-3 text-sm transition sm:px-3.5 ${showOnline ? 'border-lime text-[#e8ebf2]' : 'border-line bg-card text-[#b7becc] hover:border-line-2'}`}
            title={isPlus ? 'See who is online and call them' : 'See who is online (Plus)'}
          >
            <span className="h-2 w-2 rounded-full bg-[#3ddc84]" aria-hidden />
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
          {user && <DailyRewardChip refreshKey={call.status === 'in-call' ? call.partner : null} />}
          {user && (
            <Link
              href="/coins"
              target="_blank"
              className="flex h-10 items-center gap-2 rounded-[10px] border border-[#3a3418] bg-[#1b1a10] px-3 text-sm font-semibold text-gold max-sm:hidden"
              title="Coins"
            >
              <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                <circle cx="12" cy="12" r="8" />
                <path d="M12 8v8M9.5 10.5h4a1.5 1.5 0 0 1 0 3h-3" />
              </svg>
              {(call.wallet ?? user.wallet).coins.toLocaleString()}
            </Link>
          )}
          {/* Video calls have settings under ⋮ in the call bar. */}
          {isText && <SettingsMenu call={call} />}
          {!isPlus && (
            <Link href="/plus" target="_blank" className="flex h-10 items-center rounded-[10px] bg-gold px-3.5 text-sm font-semibold text-[#1a1608] hover:brightness-105 max-sm:hidden">
              Upgrade
            </Link>
          )}
          {user ? (
            <AccountMenu />
          ) : (
            <Link href="/login" target="_blank" className="flex h-10 items-center rounded-[10px] border border-line bg-card px-3.5 text-sm text-[#e8ebf2] max-sm:hidden">
              Log in
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
              <div className="absolute bottom-16 left-0 right-0 z-20 flex justify-center">
                <StopNext call={call} compact />
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
              className="min-h-0 rounded-3xl border border-line !bg-[#121520]"
              videoClassName={`transition-[filter] duration-700 ${fit ? '!object-contain' : ''} ${
                call.partnerHidden || call.aiHidden ? 'blur-3xl brightness-50' : call.blurPartner ? 'blur-xl' : ''
              }`}
            >
              {!matched && !showAd && !isVoice && (
                <div className="absolute inset-0 z-10 flex items-center justify-center">
                  <SearchingStage call={call} />
                </div>
              )}
              {isVoice && !showAd && (
                <VoiceStage call={call} matched={matched} partnerEmoji={call.partner ? (call.partner.avatar ?? GENDER_ICON[call.partner.gender]) : '🙂'} />
              )}
              {isVoice && (
                <div className={`absolute inset-x-0 flex justify-center px-4 ${pipOnTop ? 'bottom-4' : 'top-14'}`}>
                  <Searching call={call} />
                </div>
              )}
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
                  {matched && (
                    // Phones: top-left (the self-view sits at the bottom); larger screens: bottom-left, like the design.
                    <div className={`absolute left-3 z-20 sm:left-5 ${pipCorner === 'bl' || pipCorner === 'tr' ? 'top-3 sm:top-5' : 'top-3 sm:bottom-5 sm:top-auto'}`}>
                      <PartnerCard call={call} />
                    </div>
                  )}
                  <div className="absolute left-3 top-3 flex flex-col items-start gap-1 sm:left-5 sm:top-5">
                    {call.relayActive && (
                      <span
                        className="rounded-full bg-amber-500/90 px-2 py-0.5 text-[11px] font-medium text-white"
                        title="Your networks blocked a direct connection, so video goes through our server with a short delay."
                      >
                        Relay mode · slight delay
                      </span>
                    )}
                  </div>
                  <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-2 sm:right-4 sm:top-4">
                    <SafetyMenu call={call} />
                    {matched && <ReportButton />}
                  </div>
                </>
              )}

              {/* You (picture-in-picture): drag it to any corner; voice calls have no picture */}
              {!isVoice && (
                <DraggablePip onCornerChange={setPipCorner} className="aspect-[3/4] h-[24%] max-h-[10rem] min-h-[5rem] max-w-[36%] sm:h-[30%] sm:max-h-[168px] overflow-hidden rounded-2xl border-2 border-[#2b3243] bg-[#232836] shadow-xl md:aspect-[264/168] landscape:aspect-video max-lg:landscape:h-[34%] lg:h-[26%] [@media(max-height:500px)]:h-[30%] [@media(max-height:500px)]:min-h-[3.5rem]">
                  <VideoTile stream={call.localStream} muted mirrored className="pointer-events-none h-full w-full rounded-none !bg-[#232836]" />
                  {(!call.localStream || !call.cameraOn) && (
                    <div className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-[0.08em] text-[#6b7385]">Camera off</div>
                  )}
                  <span className="absolute bottom-2 left-2 rounded-md bg-night/80 px-2 py-0.5 text-xs text-[#e8ebf2]">You</span>
                  {!call.micOn && (
                    <span className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-md bg-[#e5484d]" aria-label="Your microphone is off">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
                        <path d="M3 3l18 18M9 9v2a3 3 0 0 0 5 2.2M15 9.3V6a3 3 0 0 0-5.6-1.5" />
                      </svg>
                    </span>
                  )}
                </DraggablePip>
              )}

              {(call.cameraProblem || call.noFace) && (
                <div className="absolute inset-x-0 bottom-3 z-20 flex justify-center px-3" role="status">
                  <p className={`rounded-full px-4 py-1.5 text-sm font-medium text-white shadow-lg ${call.cameraProblem ? 'bg-red-600/90' : 'bg-amber-500/90'}`}>
                    {call.cameraProblem
                      ? CAMERA_PROBLEM[call.cameraProblem].chip
                      : "🙂 We can't see your face — look at the camera so people don't skip you"}
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
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 pt-1 sm:gap-4 sm:pt-2 lg:grid lg:grid-cols-[1fr_auto_1fr]">
            <div className="hidden items-center gap-2.5 truncate pl-1 text-sm text-mute lg:flex">
              <CallTimer since={call.matchStartedAt} />
              <span className="h-4 w-px bg-line-2" aria-hidden />
              <span className="truncate" title={user ? user.email : 'Not logged in'}>
                {loadSettings().name || (user ? user.email.split('@')[0] : 'Guest')}
              </span>
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
            <div className="flex justify-end">
              <StopNext call={call} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
