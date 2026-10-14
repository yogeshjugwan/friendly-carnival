'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { RandomCall } from '@/lib/useRandomCall';
import { MATCHES_FOR_COINS } from '@rc/shared';
import { AdSlot } from './AdSlot';
import { spendError, useWallet } from './Coins';

const hoursUntil = (t: number) => Math.max(1, Math.ceil((t - Date.now()) / 3_600_000));
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
function BreakModal({ call, until, callMs, breakMs }: { call: RandomCall; until: number; callMs: number; breakMs: number }) {
  useEffect(() => {
    // Break over: back to matching.
    const t = window.setTimeout(() => call.resumeAfterBreak(), Math.max(0, until - Date.now()) + 1500);
    return () => window.clearTimeout(t);
  }, [until, call]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="break-title">
      <div className="relative w-full max-w-sm rounded-3xl border border-line bg-card p-6 text-center text-[#e8ebf2] shadow-2xl">
        <button onClick={call.stop} aria-label="Close" className="absolute right-4 top-4 rounded-full p-1 text-2xl leading-none text-dim hover:text-white">
          ×
        </button>
        <p className="text-5xl" aria-hidden>
          ☕
        </p>
        <h2 id="break-title" className="mt-4 font-display text-2xl font-bold">
          Time for a short break
        </h2>
        <p className="mt-2 text-sm text-mute">
          You&apos;ve had {hours(callMs)} of free calls. Video and voice calls unlock again in
        </p>
        <p className="mt-3 font-display text-4xl font-bold text-lime">
          <Countdown until={until} />
        </p>
        <p className="mt-1 text-xs text-dim">Then you get another {hours(callMs)} free. Breaks last {hours(breakMs)}.</p>
        <Link href="/plus" className="mt-6 block w-full rounded-2xl bg-lime py-3.5 text-base font-bold text-night hover:bg-lime-hover">
          Skip the break with Plus 👑
        </Link>
        <button onClick={call.textMeanwhile} className="mt-2 w-full rounded-2xl border border-line-2 bg-card-2 py-3 text-sm font-semibold hover:bg-[#262c3b]">
          💬 Text chat meanwhile
        </button>
      </div>
    </div>
  );
}

/** "No matches left today": upgrade to Plus, or watch a video for more. */
export function LimitModal({ call }: { call: RandomCall }) {
  const { limit, rewardAd } = call;
  if (rewardAd) return <RewardVideo endsAt={rewardAd.endsAt} totalMs={limit?.adMs ?? 15_000} />;
  if (!call.limitReached || !limit) return null;
  if (limit.breakUntil && limit.breakUntil > Date.now() && limit.remaining > 0) {
    return <BreakModal call={call} until={limit.breakUntil} callMs={limit.callMs} breakMs={limit.breakMs} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="limit-title">
      <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 text-center text-ink shadow-2xl">
        <button onClick={call.stop} aria-label="Close" className="absolute right-4 top-4 rounded-full p-1 text-2xl leading-none text-slate-500 hover:text-ink">
          ×
        </button>
        <p className="text-5xl" aria-hidden>
          🙈📞🙈
        </p>
        <h2 id="limit-title" className="mt-4 text-xl font-bold">
          Oops! No matches left
        </h2>
        <p className="mt-2 text-slate-600">
          You&apos;ve used today&apos;s {limit.limit} free {limit.limit === 1 ? 'match' : 'matches'}. Get more matches:
        </p>

        <Link
          href="/plus"
          className="relative mt-6 block w-full rounded-full bg-brand py-3.5 text-lg font-semibold text-white shadow hover:bg-brand-dark"
        >
          <span className="absolute -top-3 right-4 rounded-full bg-amber-300 px-2.5 py-0.5 text-xs font-semibold text-ink">Unlimited Matches</span>
          Get randomCall Plus 👑
        </Link>

        <CoinsForMatches call={call} />

        <div className="my-4 flex items-center gap-3 text-xs font-medium text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          OR
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        {limit.adsLeft > 0 ? (
          <button
            onClick={call.watchRewardAd}
            className="flex w-full items-center justify-center gap-2 rounded-full border-2 border-brand py-3 text-lg font-semibold text-brand hover:bg-brand/5"
          >
            <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">AD</span>
            Watch video · +{limit.adBonus} matches
          </button>
        ) : (
          <p className="rounded-full bg-slate-100 py-3 text-sm text-slate-500">
            No more videos today. Free matches come back in about {hoursUntil(limit.resetsAt)} h.
          </p>
        )}
      </div>
    </div>
  );
}

/** Full-screen ad with a countdown; matches unlock when it ends. */
function RewardVideo({ endsAt, totalMs }: { endsAt: number; totalMs: number }) {
  const [left, setLeft] = useState(() => Math.ceil((endsAt - Date.now()) / 1000));
  useEffect(() => {
    const t = window.setInterval(() => setLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))), 250);
    return () => window.clearInterval(t);
  }, [endsAt]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Video ad">
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
    <div className="mt-3">
      {enough ? (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await call.buyMatches();
            setBusy(false);
            setError(spendError(r));
          }}
          className="w-full rounded-full border-2 border-amber-400 py-2.5 font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
        >
          🪙 Use {MATCHES_FOR_COINS.coins} coins · +{MATCHES_FOR_COINS.matches} matches
        </button>
      ) : (
        <Link href="/coins" target="_blank" className="block w-full rounded-full border-2 border-amber-400 py-2.5 font-semibold text-amber-700 hover:bg-amber-50">
          🪙 Get coins for more matches
        </Link>
      )}
      <p className="mt-1 text-xs text-slate-500">You have {wallet.coins} coins</p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
