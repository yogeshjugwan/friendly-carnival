'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ageLabel, NO_FILTERS, PRIORITY_MATCH, TOPICS } from '@rc/shared';
import { useAuth } from '@/lib/auth';
import { countryName, flagEmoji, GENDER_ICON, GENDER_LABEL } from '@/lib/format';
import { loadSettings } from '@/lib/settings';
import type { RandomCall } from '@/lib/useRandomCall';
import { AdSlot } from './AdSlot';
import { DraggablePip, type Corner } from './DraggablePip';
import { CallControls, CancelButton, ReactionLayer, StopNext } from './CallControls';
import { FilterBar } from './FilterBar';
import { LimitModal } from './LimitModal';
import { GiftButton, GiftLayer, spendError } from './Coins';
import { FriendButton, FriendsPanel } from './Friends';
import { IncomingCallModal, OnlineUsersPanel } from './OnlineUsers';
import { PlusUpsell } from './PlusUpsell';
import { ChatPanel } from './ChatPanel';
import { SafetyMenu } from './SafetyMenu';
import { ReportDialog } from './ReportDialog';
import { PlusModal } from './PlusModal';
import { COUNTRY_OPTS, FilterChip, GENDER_OPTS } from './Landing';
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
        {partner.age && <span className="text-white/75">{ageLabel(partner.age)}</span>}
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
          <span className="rounded-full bg-lime/80 px-2 py-0.5 text-[11px] font-semibold text-white">
            {TOPICS.find((t) => t.id === partner.topic)?.emoji} #{TOPICS.find((t) => t.id === partner.topic)?.label}
          </span>
        )}
        {partner.sharedInterests.length > 0 && (
          <span className="hidden truncate text-mute md:inline">· likes {partner.sharedInterests.join(', ')}</span>
        )}
      </div>
      {partner.bio && (
        <p className="max-w-[70vw] truncate rounded-full bg-black/45 px-2.5 py-0.5 text-xs italic text-[#e6e8ec] sm:max-w-sm">“{partner.bio}”</p>
      )}
    </div>
  );
}

function Searching({ call }: { call: RandomCall }) {
  const { t } = useI18n();
  if (call.status === 'browsing') {
    return (
      <p className="max-w-xs text-center text-sm text-mute sm:text-base">
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
      <p className="flex items-center gap-2 text-sm text-mute sm:text-base">
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line-2 border-t-lime" />
        {overlay}
      </p>
      {call.status === 'searching' && call.lastLeftReason && (
        <p className="text-xs text-dim sm:text-sm">{t('status.partnerLeft')}</p>
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
  if (!user)
    return (
      <Link
        href="/login?next=/"
        target="_blank"
        className="pointer-events-auto mt-1 flex h-11 items-center gap-2.5 rounded-xl border border-[#4a3f17] bg-gold-bg px-4 text-[13px] font-semibold text-gold transition hover:border-gold/60 sm:text-sm"
      >
        <span className="max-sm:hidden">Meet a verified person next</span>
        <span className="sm:hidden">Verified person next</span> · {PRIORITY_MATCH.coins} coins
      </Link>
    );
  if (call.priorityOn) return <p className="text-sm text-gold">Looking for a ✓ Verified person for you…</p>;
  return (
    <div className="pointer-events-auto mt-1 flex flex-col items-center">
      <button
        onClick={async () => {
          setError(null);
          const r = await call.buyPriority();
          setError(spendError(r));
        }}
        className="flex h-11 items-center gap-2.5 rounded-xl border border-[#4a3f17] bg-gold-bg px-4 text-left text-gold transition hover:border-gold/60"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
        <span className="text-[13px] font-semibold sm:text-sm">
          <span className="max-sm:hidden">Meet a </span>
          <span className="sm:hidden">V</span>
          <span className="max-sm:hidden">v</span>erified person next · {PRIORITY_MATCH.coins} coins
        </span>
      </button>
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}

/** Shown when filtered searching takes a while ("No one found yet"). */
function WidenSearch() {
  const { saveSettings } = useAuth();
  return (
    <div className="pointer-events-auto mt-2 flex w-full max-w-[360px] flex-col gap-2 rounded-[18px] border border-divider bg-[rgba(23,18,31,.94)] p-4 text-center">
      <p className="m-0 font-display text-lg font-bold text-[#f4f5f7]">No one found yet</p>
      <p className="m-0 text-sm leading-normal text-mute">Fewer people match your filters right now. Widen them or keep searching.</p>
      <button
        className="flex h-11 w-full items-center justify-center rounded-[14px] border-[1.5px] border-[#6b5d84] text-sm font-semibold text-[#e6e8ec] hover:border-[#8a7aa6]"
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
  const isPlus = !!user?.plus.active;
  return (
    // Starts below the top bar, and the orbit shrinks on short screens so it never runs into the filters.
    <div className="flex flex-col items-center gap-6 px-4 pt-14 text-center sm:gap-8">
      {/* You in the middle, people orbiting, ripples going out. */}
      <div className="relative h-[min(300px,40dvh)] w-[min(300px,40dvh)] sm:h-[min(440px,46dvh)] sm:w-[min(440px,46dvh)]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="rc-ripple absolute inset-0 m-auto h-[130px] w-[130px] rounded-full border-2 border-lime sm:h-[200px] sm:w-[200px]" style={{ animationDelay: `${i}s` }} />
        ))}
        <div className="rc-orbit absolute inset-0">
          {ORBIT.map((a, i) => {
            const angle = (i / ORBIT.length) * Math.PI * 2;
            return (
              <span
                key={i}
                className="rc-counter absolute h-12 w-12 overflow-hidden rounded-full border-[3px] border-night sm:h-16 sm:w-16"
                style={{ left: `${50 + 45 * Math.cos(angle)}%`, top: `${50 + 45 * Math.sin(angle)}%`, background: a.bg }}
              >
                <svg viewBox="0 0 40 40" className="h-full w-full">
                  <circle cx="20" cy="16" r="8" fill={a.skin} />
                  <path d="M6 40c2-10 7-14 14-14s12 4 14 14z" fill={a.fg} />
                </svg>
              </span>
            );
          })}
        </div>
        <span className="absolute inset-0 m-auto h-[110px] w-[110px] overflow-hidden rounded-full border-[3px] border-lime bg-[#1f2638] sm:h-[150px] sm:w-[150px]">
          {call.localStream && call.cameraOn ? (
            <VideoTile stream={call.localStream} muted mirrored className="h-full w-full rounded-none !bg-[#1f2638]" />
          ) : (
            <svg viewBox="0 0 40 40" className="h-full w-full">
              <circle cx="20" cy="16" r="8" fill="#c68b5e" />
              <path d="M6 40c2-10 7-14 14-14s12 4 14 14z" fill="#3a4a6e" />
            </svg>
          )}
        </span>
      </div>
      <div className="flex flex-col items-center gap-2.5 sm:gap-3">
        <h1 className="m-0 font-display text-[30px] font-bold text-[#f4f5f7] sm:text-[40px]" role="status">
          {call.status === 'connecting' ? t('status.connecting') : t('status.searching').replace(/[.…]+$/, '')}
          {call.status === 'searching' && (
            <span aria-hidden>
              <span className="rc-dot">.</span>
              <span className="rc-dot [animation-delay:.2s]">.</span>
              <span className="rc-dot [animation-delay:.4s]">.</span>
            </span>
          )}
        </h1>
        {call.status === 'searching' && call.lastLeftReason ? (
          <p className="m-0 text-sm text-mute sm:text-[15px]">{t('status.partnerLeft')}</p>
        ) : (
          <p className="m-0 text-sm text-mute sm:text-[15px]">
            {isPlus && call.online !== null ? `${Math.max(0, call.online - 1).toLocaleString()} people online · ` : ''}
            {matching && matching !== 'anyone' ? `Matching ${matching} · ` : ''}usually under 5 seconds
          </p>
        )}
      </div>
      {call.searchingLong && <WidenSearch />}
      {call.status === 'searching' && <PriorityButton call={call} />}
    </div>
  );
}

/** The people orbiting you while matching: [tile colour, skin, clothes]. */
const ORBIT = [
  { bg: '#ff8a9a', skin: '#f1c7a5', fg: '#5a1730' },
  { bg: '#7fd6c2', skin: '#8d5a3b', fg: '#0f3d35' },
  { bg: '#ffc37a', skin: '#e8b48a', fg: '#5c2a10' },
  { bg: '#8fb2ff', skin: '#5e3a26', fg: '#17255a' },
  { bg: '#d7a6ff', skin: '#c68b5e', fg: '#3a1a60' },
  { bg: '#f7e07a', skin: '#f1c7a5', fg: '#4f3e0c' },
];

/** Who you're talking to, as pills over the top-left of the video: name · country, and the call clock. */
function PartnerPills({ call }: { call: RandomCall }) {
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
  const pill = 'flex h-9 items-center gap-1.5 rounded-full bg-black/45 px-3 text-[13px] text-white backdrop-blur';
  return (
    <>
      <span className={`${pill} min-w-0 max-w-full font-semibold`}>
        {p.avatar && <span aria-hidden>{p.avatar}</span>}
        <span className="truncate">
          {p.name || (
            <span title={GENDER_LABEL[p.gender]} aria-label={GENDER_LABEL[p.gender]}>
              {GENDER_ICON[p.gender]} Stranger
            </span>
          )}
          {p.age && <span className="font-normal text-white/75"> · {ageLabel(p.age)}</span>}
          {where && <span className="font-normal text-white/75"> · {where}</span>}
        </span>
        {p.verified && <VerifiedBadge />}
        {p.plus && (
          <span title="Plus member" aria-label="Plus member">
            👑
          </span>
        )}
        {p.isNew && <span className="rounded bg-gold px-1.5 text-[10px] font-bold text-[#1a1608]">NEW</span>}
      </span>
      <span className={`${pill} font-medium`}>
        <i className="rc-blink h-[7px] w-[7px] rounded-full bg-lime" aria-hidden />
        <CallTimer since={call.matchStartedAt} />
      </span>
      {line && <span className={`${pill} max-w-[22rem] truncate text-lime max-md:hidden`}>{line}</span>}
    </>
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
    <span className="tabular-nums" aria-label="Call length">
      {h ? `${h}:` : ''}
      {mm}:{ss}
    </span>
  );
}

/** Matching (final design): ripples around a gradient camera, "Finding someone…", and the Plus filters. */
function MatchPanel({ call, onPlus }: { call: RandomCall; onPlus: () => void }) {
  const { user, saveSettings } = useAuth();
  const isPlus = !!user?.plus.active;
  const [filters, setFilters] = useState(() => loadSettings().filters ?? NO_FILTERS);
  const [menu, setMenu] = useState<'g' | 'c' | null>(null);
  const pick = (patch: Partial<typeof filters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    setMenu(null);
    void saveSettings({ ...loadSettings(), filters: next }).catch(() => undefined);
  };
  const open = (which: 'g' | 'c') => (isPlus ? setMenu(menu === which ? null : which) : onPlus());
  if (call.status === 'browsing') {
    return (
      <p className="max-w-xs px-4 text-center text-sm text-mute sm:text-base">
        Pick someone from <span className="font-semibold text-white">Online</span> or <span className="font-semibold text-white">Friends</span> to call, or press{' '}
        <span className="font-semibold text-white">Next</span> for a random stranger.
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2.5 px-4 text-center sm:gap-3.5">
      <div className="relative h-[110px] w-full sm:h-[220px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="rc-ripple-sm absolute inset-0 m-auto h-[120px] w-[120px] rounded-full border-2 border-lime sm:h-[140px] sm:w-[140px]" style={{ animationDelay: `${i}s` }} />
        ))}
        <span className="absolute inset-0 m-auto grid h-16 w-16 place-items-center rounded-full bg-lime sm:h-[88px] sm:w-[88px]">
          <svg viewBox="0 0 24 24" className="h-7 w-7 sm:h-9 sm:w-9" fill="none" stroke="#0b0d10" strokeWidth={2.2} aria-hidden>
            <rect x="2" y="6" width="14" height="12" rx="2" />
            <path d="M16 10l6-3v10l-6-3" />
          </svg>
        </span>
      </div>
      <h1 className="m-0 font-display text-2xl font-bold sm:text-[34px]" role="status">
        {call.status === 'connecting' ? 'Connecting…' : 'Finding someone…'}
      </h1>
      <p className="m-0 text-sm text-mute sm:text-[15px]">
        {call.status === 'searching' && call.lastLeftReason ? 'They left — finding someone new · ' : ''}
        {call.online !== null ? <span className="max-sm:hidden">{Math.max(call.online - 1, 0).toLocaleString()} online · </span> : null}
        <span className="sm:hidden">Usually</span>
        <span className="max-sm:hidden">usually</span> under 5 seconds
      </p>
      <div className="mt-1.5 flex items-center gap-2 text-left max-sm:hidden">
        <FilterChip label="Gender" value={filters.gender} options={GENDER_OPTS} locked={!isPlus} open={menu === 'g'} onOpen={() => open('g')} onPick={(v) => pick({ gender: v })} />
        <FilterChip label="Country" value={filters.country} options={COUNTRY_OPTS} locked={!isPlus} open={menu === 'c'} onOpen={() => open('c')} onPick={(v) => pick({ country: v })} />
      </div>
      {!isPlus && <p className="m-0 text-[13px] text-[#cdb766] max-sm:hidden">Filters are a Plus feature</p>}
      {call.searchingLong && <WidenSearch />}
      {call.status === 'searching' && <PriorityButton call={call} />}
    </div>
  );
}

/** Your own camera as a tile ("You"), with mic / camera buttons on phones while matching. */
function SelfTile({ call, className = '', controls = false }: { call: RandomCall; className?: string; controls?: boolean }) {
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
  const stopRef = useRef(call.stop);
  stopRef.current = call.stop;
  const [reportOpen, setReportOpen] = useState(false);
  /** "Tap to reveal" asks once more before showing a hidden video. */
  const [revealAsk, setRevealAsk] = useState(false);
  useEffect(() => setRevealAsk(false), [call.partner]);
  const [plusOpen, setPlusOpen] = useState(false);
  // Report abuse in the more menu opens the same dialog.
  useEffect(() => {
    const open = () => setReportOpen(true);
    window.addEventListener('rc:report', open);
    return () => window.removeEventListener('rc:report', open);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (call.mode === 'text' || !['searching', 'in-call', 'connecting', 'browsing'].includes(call.status)) return;
      // Esc stops (or cancels matching); arrow right or Space for the next person.
      if (e.key === 'Escape') {
        if (document.querySelector('[role="dialog"]')) return;
        e.preventDefault();
        stopRef.current();
      } else if (e.key === 'ArrowRight' || (e.code === 'Space' && el?.tagName !== 'BUTTON')) {
        e.preventDefault();
        nextRef.current();
      }
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
    <main ref={mainRef} className={`flex h-[100dvh] w-full flex-col overflow-hidden bg-night ${isText ? 'px-2 pb-2 pt-2 sm:px-5 sm:pb-5 sm:pt-3' : 'sm:p-4'}`}>
      <div className="flex min-h-0 flex-1 flex-col gap-2 sm:gap-3 [@media(max-height:500px)]:gap-1.5">
        {/* Header (text chat): logo · online · settings · upgrade. Calls carry these over the video instead. */}
        {isText && (
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
        )}

        {isText && (
          <div className="sm:hidden [@media(max-height:500px)]:hidden">
            <FilterBar />
          </div>
        )}

        <LimitModal call={call} />
        <IncomingCallModal call={call} />
        {/* Text chat has no side column, so the list floats on the right there. */}
        {showOnline && isText && <OnlineUsersPanel call={call} onClose={closeOnline} className="fixed inset-y-2 right-2 z-40 w-[min(24rem,95vw)] shadow-2xl" />}
        {showFriends && isText && <FriendsPanel call={call} onClose={closeFriends} className="fixed inset-y-2 right-2 z-40 w-[min(24rem,95vw)] shadow-2xl" />}
        {onlineUpsell && <PlusUpsell onClose={() => setOnlineUpsell(false)} reason="See who’s online right now" body="With Plus, see who is online and call them directly." />}
        {!isPlus && call.limit && !call.limit.unlimited && call.limit.remaining <= 5 && call.status !== 'limited' && (
          <p className="-mt-1 text-xs text-amber-300">
            {call.limit.remaining === 0 ? 'No free matches left today.' : `${call.limit.remaining} free match${call.limit.remaining === 1 ? '' : 'es'} left today.`}{' '}
            <Link href="/plus" className="font-semibold underline">
              Get unlimited
            </Link>
          </p>
        )}
        {call.plusRequired && <PlusUpsell onClose={call.dismissPlusRequired} reason="Want to choose who you meet?" body="With Plus, pick gender and country so every match fits." />}
        {call.notice && (
          <p role="status" className="rounded-xl bg-gold-bg px-3 py-2 text-sm text-gold">
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
                <div className="absolute inset-0 overflow-hidden rounded-xl bg-night/90">
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
          // Video / voice: the stranger and you side by side on larger screens; on phones the stranger fills the screen with you inset.
          <div className={`flex min-h-0 flex-1 flex-col gap-3 sm:grid ${isVoice ? '' : 'sm:grid-cols-2'}`}>
            {/* While matching on phones, your camera comes first. */}
            {!isVoice && !matched && <SelfTile call={call} controls className="mx-2 mt-2 shrink-0 max-sm:h-[52dvh] sm:order-2 sm:m-0" />}
            <VideoTile
              stream={matched ? call.remoteStream : null}
              videoRef={call.setPartnerVideo}
              forceVisible={call.relayActive}
              className={`min-h-0 flex-1 sm:rounded-3xl ${
                matched || isVoice
                  ? 'rounded-b-[28px] !bg-[linear-gradient(165deg,#8a5fc2,#3b2a4f)]'
                  : 'max-sm:!bg-transparent sm:border sm:border-[#1c1f26] sm:!bg-[radial-gradient(circle_at_50%_45%,#1e0f2a_0%,#120d18_65%)]'
              }`}
              videoClassName={`absolute inset-0 transition-[filter] duration-700 ${fit ? '!object-contain' : ''} ${
                reportOpen || call.partnerHidden || call.aiHidden ? 'blur-3xl brightness-50' : call.blurPartner ? 'blur-xl' : ''
              }`}
            >
              {!matched && !showAd && !isVoice && (
                <div className="absolute inset-0 z-10 flex items-center justify-center max-sm:items-start max-sm:pt-1">
                  <MatchPanel call={call} onPlus={() => setPlusOpen(true)} />
                </div>
              )}
              {isVoice && !showAd && (
                <VoiceStage call={call} matched={matched} partnerEmoji={call.partner ? (call.partner.avatar ?? GENDER_ICON[call.partner.gender]) : '🙂'} />
              )}
              {isVoice && !matched && !showAd && (
                <div className="absolute inset-x-0 top-14 flex justify-center px-4">
                  <Searching call={call} />
                </div>
              )}
              {matched && !reportOpen && (call.partnerHidden || call.aiHidden) && (
                <div className="absolute inset-0 z-[15] flex items-center justify-center overflow-y-auto p-4">
                  <section className="flex w-full max-w-[400px] flex-col gap-3 rounded-[22px] border border-divider bg-[rgba(23,18,31,.94)] p-5 text-center shadow-[0_30px_80px_rgba(0,0,0,.55)] sm:gap-4 sm:p-7">
                    <span aria-hidden className="flex h-14 w-14 items-center justify-center self-center rounded-full bg-[#FF6FAE1F] text-lime sm:h-[72px] sm:w-[72px]">
                      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
                        <path d="M9 12l2 2 4-4" />
                      </svg>
                    </span>
                    <h2 className="m-0 font-display text-[22px] font-bold leading-[1.15] sm:text-[26px]">
                      {call.aiHidden ? 'Blurred for safety' : call.partner?.isNew ? 'New user, video hidden' : 'Partner video hidden'}
                    </h2>
                    <p className="m-0 text-sm leading-normal text-mute sm:text-base">
                      {call.aiHidden
                        ? 'Our system flagged possible nudity. You won’t see it unless you choose to.'
                        : 'Hidden for your safety. You won’t see it unless you choose to.'}
                    </p>
                    <div className="mt-1 flex flex-col gap-2.5">
                      <button
                        onClick={() => setReportOpen(true)}
                        className="flex h-12 w-full items-center justify-center rounded-[14px] bg-[#D93A4A] font-display text-base font-bold text-white sm:h-[52px]"
                      >
                        Report &amp; find next
                      </button>
                      <button
                        onClick={call.next}
                        className="flex h-12 w-full items-center justify-center rounded-[14px] bg-lime font-display text-base font-bold text-night sm:h-[52px]"
                      >
                        Next
                      </button>
                      {revealAsk ? (
                        <div role="alertdialog" aria-label="Reveal video?" className="flex flex-col gap-2.5 rounded-[14px] border border-[#4A2424] bg-[#2A1616] p-3.5 text-left">
                          <b className="text-[#FFD3CE]">Show this video anyway?</b>
                          <span className="text-[13px] text-[#FFD3CE]">It may contain nudity. You can report it at any time.</span>
                          <div className="flex gap-2">
                            <button type="button" autoFocus onClick={() => setRevealAsk(false)} className="h-11 flex-1 rounded-xl border-[1.5px] border-[#6b5d84] text-sm font-semibold text-[#e6e8ec]">
                              Keep hidden
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRevealAsk(false);
                                call.togglePartnerHidden();
                              }}
                              className="h-11 flex-1 rounded-xl bg-[#3A2A33] text-sm font-semibold text-[#FFD3CE]"
                            >
                              Show anyway
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setRevealAsk(true)} className="flex h-11 w-full items-center justify-center text-sm font-semibold text-mute underline hover:text-white">
                          Tap to reveal (18+)
                        </button>
                      )}
                    </div>
                  </section>
                </div>
              )}

              {/* A fresh ad between strangers; the next match connects underneath. */}
              {showAd && (
                <div className="absolute inset-0 z-10">
                  <AdSlot placement="break" refreshKey={call.adKey} className="h-full rounded-none" />
                  <p className="absolute left-0 right-0 top-3 text-center text-xs text-white/80">Your next stranger is right after this ad</p>
                </div>
              )}

              {matched && !showAd && (
                // Top of the video: who they are and the call clock; Report on the right.
                <div className="absolute inset-x-4 top-4 z-20 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
                    <PartnerPills call={call} />
                    {call.relayActive && (
                      <span
                        className="flex h-9 items-center rounded-full bg-amber-500/90 px-3 text-xs font-medium text-white"
                        title="Your networks blocked a direct connection, so video goes through our server with a short delay."
                      >
                        Relay · slight delay
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setReportOpen(true)}
                      aria-label="Report or block"
                      className="flex h-11 items-center gap-1.5 rounded-full bg-black/50 text-[13px] font-medium text-stop-text max-sm:w-11 max-sm:justify-center sm:px-4"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
                        <path d="M5 21V4h11l-2 4 2 4H5" />
                      </svg>
                      <span className="max-sm:hidden">Report</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Phones, in a call: you, inset bottom-right. */}
              {!isVoice && matched && (
                <div className="absolute bottom-4 right-4 z-20 h-[140px] w-[104px] overflow-hidden rounded-2xl border-2 border-white/25 sm:hidden">
                  <SelfTile call={call} className="h-full w-full !rounded-none" />
                </div>
              )}

              {(call.cameraProblem || call.noFace) && (
                <div className="absolute inset-x-0 bottom-3 z-20 flex justify-center px-3" role="status">
                  <p className={`rounded-full px-4 py-1.5 text-sm font-medium text-white shadow-lg ${call.cameraProblem ? 'bg-red-600/90' : 'bg-amber-500/90'}`}>
                    {call.cameraProblem ? CAMERA_PROBLEM[call.cameraProblem].chip : "🙂 We can't see your face — look at the camera so people don't skip you"}
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
                <div className="absolute inset-x-3 top-20 z-20 flex justify-center">
                  <div className="w-full max-w-md rounded-2xl bg-black/70 px-4 py-3 text-center text-white shadow-xl backdrop-blur" role="status">
                    <p className="text-xs font-semibold uppercase tracking-wide text-lime">Icebreaker</p>
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
            {/* Larger screens: you, beside them. */}
            {!isVoice && matched && <SelfTile call={call} className="max-sm:hidden" />}

            {showOnline && <OnlineUsersPanel call={call} onClose={closeOnline} className="fixed z-40 inset-x-0 bottom-0 h-[400px] rounded-t-3xl shadow-2xl sm:inset-x-auto sm:bottom-[108px] sm:right-8 sm:top-8 sm:h-auto sm:w-[360px] sm:rounded-[20px]" />}
            {showFriends && <FriendsPanel call={call} onClose={closeFriends} className="fixed z-40 inset-x-0 bottom-0 h-[400px] rounded-t-3xl shadow-2xl sm:inset-x-auto sm:bottom-[108px] sm:right-8 sm:top-8 sm:h-auto sm:w-[360px] sm:rounded-[20px]" />}
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
                className="fixed z-40 inset-x-0 bottom-0 h-[400px] rounded-t-3xl shadow-2xl sm:inset-x-auto sm:bottom-[108px] sm:right-8 sm:top-8 sm:h-auto sm:w-[360px] sm:rounded-[20px]"
              />
            )}
          </div>
        )}

        {/* Under the video: Stop / Next (or Cancel) on the left, the keys, the controls on the right. Phones: controls row, then Stop / Next. */}
        {!isText && (
          <div className="flex shrink-0 flex-col gap-3 px-4 pb-6 pt-3 sm:h-16 sm:flex-row-reverse sm:items-center sm:justify-between sm:px-1 sm:pb-0 sm:pt-0">
            <div className={matched ? 'w-full sm:w-auto' : 'max-sm:hidden'}>
              <CallControls
                rail
                minimal={!matched}
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
            <span className="whitespace-nowrap text-[13px] text-[#8a8f99] max-lg:hidden">{matched ? 'Esc to stop · → for next' : 'Esc to cancel'}</span>
            {matched || call.status === 'browsing' ? (
              <StopNext call={call} wide />
            ) : (
              <div className="flex w-full gap-2 sm:w-auto">
                <CancelButton call={call} wide />
                <button
                  type="button"
                  onClick={() => setPlusOpen(true)}
                  className="flex h-14 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-[#4a3f17] bg-gold-bg text-sm font-semibold text-gold sm:hidden"
                >
                  Filters{isPlus ? '' : ' · Plus'}
                </button>
              </div>
            )}
          </div>
        )}
        {reportOpen && <ReportDialog call={call} onClose={() => setReportOpen(false)} />}
        {plusOpen && <PlusModal onClose={() => setPlusOpen(false)} />}
      </div>
    </main>
  );
}
