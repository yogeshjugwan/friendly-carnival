'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { NO_FILTERS, PRIORITY_MATCH } from '@rc/shared';
import { useAuth } from '@/lib/auth';
import { countryName } from '@/lib/format';
import { loadSettings } from '@/lib/settings';
import { MAX_RECONNECTS, type RandomCall } from '@/lib/useRandomCall';
import { StateActions, StateCard } from '../StateCard';
import { spendError } from '../Coins';
import { VideoTile } from '../VideoTile';
import { useI18n, type TKey } from '@/lib/i18n';

const STATUS_TEXT: Record<string, TKey> = {
  searching: 'status.searching',
  connecting: 'status.connecting',
};
export function Searching({ call }: { call: RandomCall }) {
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
      {call.searchingLong && <WidenSearch call={call} />}
      {call.status === 'searching' && <PriorityButton call={call} />}
    </div>
  );
}
/** ⭐ Pay a few coins to meet a verified person next. */
export function PriorityButton({ call }: { call: RandomCall }) {
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
export function WidenSearch({ call }: { call: RandomCall }) {
  const { user, saveSettings } = useAuth();
  const isPlus = !!user?.plus.active;
  const outline =
    'flex h-11 w-full items-center justify-center rounded-[14px] border-[1.5px] border-[#6b5d84] text-sm font-semibold text-[#e6e8ec] hover:border-[#8a7aa6]';
  // Jump to the visible filter bar (free users get the Plus prompt from it).
  const changeFilters = () => {
    const selects = Array.from(document.querySelectorAll<HTMLSelectElement>('[aria-label="Match filters"] select'));
    const target = selects.find((el) => el.offsetParent !== null);
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target?.focus();
  };
  return (
    <div className="pointer-events-auto mt-2 flex w-full max-w-[360px] flex-col gap-2 rounded-[18px] border border-divider bg-[rgba(23,18,31,.94)] p-4 text-center">
      <p className="m-0 font-display text-lg font-bold text-[#f4f5f7]">No one found yet</p>
      <p className="m-0 text-sm leading-normal text-mute">Fewer people match your filters right now. Widen them or keep searching.</p>
      <button
        className="flex h-11 w-full items-center justify-center rounded-[14px] bg-lime font-display text-sm font-bold text-night hover:bg-lime-hover"
        onClick={() => void saveSettings({ ...loadSettings(), filters: { ...NO_FILTERS } })}
      >
        Connect to anyone instead
      </button>
      <button className={outline} onClick={changeFilters}>
        {isPlus ? 'Change filters' : 'Change filters · Plus'}
      </button>
      {call.mode !== 'text' && (
        <button className={outline} onClick={call.textMeanwhile}>
          Try text chat
        </button>
      )}
    </div>
  );
}
/** Shown while a live call that dropped is being reconnected (ICE restart). */
export function ConnectionLost({ call }: { call: RandomCall }) {
  if (call.status !== 'in-call' || call.reconnectAttempt === 0) return null;
  return (
    <StateCard
      overlay
      titleId="conn-lost-title"
      icon="wifiOff"
      tone="danger"
      title="Connection lost"
      body={
        <span role="status" aria-live="polite">
          Reconnecting… attempt {call.reconnectAttempt} of {MAX_RECONNECTS}. Check your Wi‑Fi or mobile data.
        </span>
      }
    >
      <StateActions
        actions={[
          { label: 'Reconnect now', kind: 'primary', onClick: call.reconnectNow },
          { label: 'Back to Home', kind: 'outline', onClick: call.stop },
        ]}
      />
    </StateCard>
  );
}
/** "Finding someone for you…" on the video stage: pulse rings, what you're matching on, Priority. */
export function SearchingStage({ call }: { call: RandomCall }) {
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
      {call.searchingLong && <WidenSearch call={call} />}
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
