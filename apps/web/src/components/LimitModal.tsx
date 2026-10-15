'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { RandomCall } from '@/lib/useRandomCall';
import { MATCHES_FOR_COINS } from '@rc/shared';
import { AdSlot } from './AdSlot';
import { spendError, useWallet } from './Coins';
import { PlusModal } from './PlusModal';
import { StateActions, StateCard } from './StateCard';
import { useFocusTrap } from '@/lib/useFocusTrap';

const hours = (ms: number) => `${Math.round(ms / 3_600_000)} ${Math.round(ms / 3_600_000) === 1 ? 'hour' : 'hours'}`;

/** mm:ss (or h:mm:ss) until `t`, ticking. */
function Countdown({ until }: { until: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const s = Math.max(0, Math.ceil((until - now) / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return <span className="tabular-nums">{h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`}</span>;
}

/** Free call time used up: a short break, then more free time (or Plus / text chat now). */
function BreakModal({ call, onPlus, until, callMs, breakMs }: { call: RandomCall; onPlus: () => void; until: number; callMs: number; breakMs: number }) {
  useEffect(() => {
    // Break over: back to matching.
    const t = window.setTimeout(() => call.resumeAfterBreak(), Math.max(0, until - Date.now()) + 1500);
    return () => window.clearTimeout(t);
  }, [until, call]);
  return (
    <StateCard
      overlay
      icon="timer"
      tone="gold"
      titleId="break-title"
      title="Time for a short break"
      body={
        <>
          You&apos;ve had {hours(callMs)} of free calls. Video and voice unlock again in{' '}
          <b className="tabular-nums text-[#f4f5f7]">
            <Countdown until={until} />
          </b>
          . Then you get another {hours(callMs)} free (breaks last {hours(breakMs)}).
        </>
      }
    >
      <div className="flex flex-col gap-2 text-left">
        <OptionRow tone="gold" title="Skip the break with Plus" sub="Unlimited calls + filters" onClick={onPlus} />
        <OptionRow tone="grey" title="Text chat meanwhile" sub="Text chats have no break" onClick={call.textMeanwhile} />
      </div>
      <StateActions actions={[{ label: 'Maybe later', kind: 'link', onClick: call.stop }]} />
    </StateCard>
  );
}

const ROW = {
  gold: 'bg-gold-bg border-[#4A3F17] [&_b]:text-gold [&_.chev]:text-gold',
  pink: 'bg-pick border-[#5A2550] [&_b]:text-lime [&_.chev]:text-lime',
  grey: 'bg-card-2 border-line-2 [&_b]:text-[#E6E8EC] [&_.chev]:text-[#E6E8EC]',
} as const;

/** One of the "keep going" choices: title, sub-line and a chevron. */
function OptionRow({
  tone,
  title,
  sub,
  onClick,
  href,
  disabled,
}: {
  tone: keyof typeof ROW;
  title: React.ReactNode;
  sub: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}) {
  const cls = `flex min-h-[60px] w-full items-center gap-3 rounded-[14px] border px-4 text-left text-[#f4f5f7] hover:brightness-110 disabled:opacity-50 ${ROW[tone]}`;
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <b className="block font-display text-[15px] font-bold">{title}</b>
        <span className="text-[13px] text-mute">{sub}</span>
      </span>
      <span className="chev text-lg" aria-hidden>
        ›
      </span>
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}

/** "No matches left today": upgrade to Plus, or watch a video for more. */
export function LimitModal({ call }: { call: RandomCall }) {
  const { limit, rewardAd } = call;
  const [plusOpen, setPlusOpen] = useState(false);
  if (rewardAd) return <RewardVideo endsAt={rewardAd.endsAt} totalMs={limit?.adMs ?? 15_000} />;
  if (!call.limitReached || !limit) return null;
  if (limit.breakUntil && limit.breakUntil > Date.now() && limit.remaining > 0) {
    return (
      <>
        <BreakModal call={call} onPlus={() => setPlusOpen(true)} until={limit.breakUntil} callMs={limit.callMs} breakMs={limit.breakMs} />
        {plusOpen && <PlusModal onClose={() => setPlusOpen(false)} />}
      </>
    );
  }

  return (
    <>
      <StateCard
        overlay
        icon="timer"
        tone="gold"
        titleId="limit-title"
        title="You’ve used today’s free matches"
        body={
          <>
            Free matches reset in{' '}
            <b className="text-[#f4f5f7]">
              <Countdown until={limit.resetsAt} />
            </b>
            . Want to keep going?
          </>
        }
      >
        <div className="flex flex-col gap-2 text-left">
          <OptionRow tone="gold" title="Get Plus" sub="Unlimited matches + filters" onClick={() => setPlusOpen(true)} />
          <CoinsForMatches call={call} />
          {limit.adsLeft > 0 && (
            <OptionRow tone="grey" title={`Watch a video · +${limit.adBonus} matches`} sub="A short ad, then keep matching" onClick={call.watchRewardAd} />
          )}
          <OptionRow tone="grey" title="Invite a friend" sub="You both get 1 day of Plus" href="/invite" />
        </div>
        <StateActions actions={[{ label: 'Maybe later', kind: 'link', onClick: call.stop }]} />
      </StateCard>
      {plusOpen && <PlusModal onClose={() => setPlusOpen(false)} />}
    </>
  );
}

/** Full-screen ad with a countdown; matches unlock when it ends. */
function RewardVideo({ endsAt, totalMs }: { endsAt: number; totalMs: number }) {
  const trap = useFocusTrap();
  const [left, setLeft] = useState(() => Math.ceil((endsAt - Date.now()) / 1000));
  useEffect(() => {
    const t = window.setInterval(() => setLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))), 250);
    return () => window.clearInterval(t);
  }, [endsAt]);

  return (
    <div ref={trap} className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Video ad">
      <div className="flex items-center justify-between px-4 py-3 text-sm text-white">
        <span className="rounded bg-white/15 px-2 py-0.5 text-xs font-semibold">AD</span>
        <span aria-live="polite">{left > 0 ? `Reward in ${left}s` : 'Unlocking matches…'}</span>
      </div>
      <div className="relative min-h-0 flex-1">
        <AdSlot placement="break" refreshKey={endsAt} className="h-full rounded-none" />
      </div>
      <div className="h-1 bg-white/10">
        <div className="h-full bg-amber-400 transition-[width] duration-300" style={{ width: `${Math.min(100, 100 - ((left * 1000) / totalMs) * 100)}%` }} />
      </div>
    </div>
  );
}

/** "Use 30 coins · +10 matches" (logged-in users). */
function CoinsForMatches({ call }: { call: RandomCall }) {
  const wallet = useWallet(call);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!wallet) return null;
  const enough = wallet.coins >= MATCHES_FOR_COINS.coins;
  return (
    <>
      {enough ? (
        <OptionRow
          tone="pink"
          title={`${MATCHES_FOR_COINS.matches} more matches`}
          sub={`${MATCHES_FOR_COINS.coins} coins · you have ${wallet.coins}`}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await call.buyMatches();
            setBusy(false);
            setError(spendError(r));
          }}
        />
      ) : (
        <OptionRow tone="pink" title={`${MATCHES_FOR_COINS.matches} more matches`} sub={`${MATCHES_FOR_COINS.coins} coins · get coins`} href="/coins" />
      )}
      {error && <p className="m-0 text-xs text-stop-text">{error}</p>}
    </>
  );
}
