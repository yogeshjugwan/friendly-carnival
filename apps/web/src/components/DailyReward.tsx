'use client';

import { useCallback, useEffect, useState } from 'react';
import { STREAK_REWARDS, type DailyStatus } from '@rc/shared';
import { ACCOUNT_CHANGED, api, useAuth } from '@/lib/auth';

/** Daily streak status for the logged-in user, plus a claim action. */
function useDaily(refreshKey?: unknown) {
  const { token } = useAuth();
  const [status, setStatus] = useState<DailyStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return setStatus(null);
    api<DailyStatus>('/auth/daily', undefined, token)
      .then(setStatus)
      .catch(() => undefined);
  }, [token, refreshKey]);

  const claim = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<{ status: DailyStatus; coins: number }>('/auth/daily/claim', {}, token);
      setStatus(r.status);
      setMessage(`+${r.coins} 🪙 added!`);
      window.dispatchEvent(new Event(ACCOUNT_CHANGED));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not claim');
    } finally {
      setBusy(false);
    }
  }, [token]);

  return { status, busy, message, claim };
}

/** Big card (home and coins pages): the week's ladder and a claim button. */
export function DailyRewardCard({ className = '' }: { className?: string }) {
  const { status, busy, message, claim } = useDaily();
  if (!status) return null;
  const day = status.claimedToday ? status.streak : status.streak + 1;
  const canClaim = !status.claimedToday && !status.needsChat && !status.needsEmail;
  const hint =
    message ??
    (status.claimedToday
      ? 'Come back tomorrow to keep your streak.'
      : status.needsEmail
        ? 'Confirm your email to start collecting.'
        : status.needsChat
          ? `Have one chat today to unlock ${status.reward} coins`
          : 'Your reward is ready!');
  return (
    <section
      aria-label="Daily streak"
      className={`flex flex-col gap-2.5 rounded-[18px] border border-line bg-card p-3.5 sm:gap-3.5 sm:rounded-[20px] sm:p-[22px] ${className}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="m-0 font-display text-[15px] font-bold text-[#f4f5f7] sm:text-lg">
            Daily streak<span className="font-medium text-mute"> · day {status.streak}</span>
          </h2>
          <p className="m-0 text-xs text-dim sm:text-[13px]" aria-live="polite">
            {hint}
          </p>
        </div>
        {status.claimedToday ? (
          <span className="shrink-0 rounded-xl border border-line px-3.5 py-2.5 text-[13px] font-semibold text-lime">Claimed ✓</span>
        ) : (
          <button
            onClick={() => void claim()}
            disabled={busy || !canClaim}
            className={`h-11 shrink-0 rounded-xl px-4 text-[13px] font-semibold transition ${
              canClaim ? 'bg-lime text-[#0b0d10] hover:bg-lime-hover' : 'cursor-not-allowed border border-line-2 bg-card text-mute'
            }`}
          >
            {busy ? 'Claiming…' : `Claim ${status.reward}`}
          </button>
        )}
      </div>
      <ol className="m-0 grid list-none grid-cols-7 gap-1 p-0 text-center sm:gap-2">
        {STREAK_REWARDS.map((coins, i) => {
          const n = i + 1;
          const done = n <= status.streak;
          const today = n === Math.min(day, STREAK_REWARDS.length) && !status.claimedToday;
          return (
            <li
              key={n}
              aria-current={today ? 'step' : undefined}
              className={`flex flex-col items-center rounded-[10px] py-2 text-[10px] sm:rounded-xl sm:py-3 sm:text-xs ${
                today ? 'bg-lime text-[#0b0d10]' : done ? 'bg-lime/15 text-lime' : 'bg-card-2 text-dim'
              }`}
            >
              <span>
                <span className="max-sm:hidden">Day </span>
                <span className="sm:hidden">D</span>
                {n}
              </span>
              <b className={`font-display text-sm font-bold sm:mt-0.5 sm:text-lg ${today ? 'text-[#0b0d10]' : done ? 'text-lime' : 'text-[#e6e8ec]'}`}>
                {coins}
              </b>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Small chip on the call screen once today's reward is unlocked. */
export function DailyRewardChip({ refreshKey }: { refreshKey: unknown }) {
  const { status, busy, message, claim } = useDaily(refreshKey);
  if (message) return <span className="rounded-full bg-orange-500/90 px-3 py-1.5 text-xs font-semibold text-white">{message}</span>;
  if (!status || status.claimedToday || status.needsChat || status.needsEmail) return null;
  return (
    <button
      onClick={() => void claim()}
      disabled={busy}
      className="rounded-full bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-orange-600 disabled:opacity-60"
      title="Daily reward"
    >
      🔥 Claim {status.reward} 🪙
    </button>
  );
}
