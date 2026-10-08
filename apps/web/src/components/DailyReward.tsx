'use client';

import { useCallback, useEffect, useState } from 'react';
import { STREAK_REWARDS, type DailyStatus } from '@rc/shared';
import { ACCOUNT_CHANGED, api, useAuth } from '@/lib/auth';
import { FlameIcon } from './UiIcons';

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
    <section className={`flex flex-col gap-4 rounded-[18px] border border-[#3a2a1a] bg-[#16130f] p-4 sm:p-5 ${className}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2a1c10]">
          <FlameIcon className="h-5 w-5" color="#ff8a3d" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-base font-semibold text-[#f4f6fa]">{status.streak}-day streak</span>
          <span className="text-[13px] text-mute">{hint}</span>
        </div>
        {status.claimedToday ? (
          <span className="rounded-[10px] border border-[#3a2a1a] px-3.5 py-2 text-[13px] font-semibold text-[#ff8a3d]">Claimed ✓</span>
        ) : (
          <button
            onClick={() => void claim()}
            disabled={busy || !canClaim}
            className={`h-9 rounded-[10px] px-3.5 text-[13px] font-semibold ${
              canClaim ? 'bg-[#ff8a3d] text-[#1a0f06] hover:brightness-110' : 'cursor-not-allowed border border-[#3a2a1a] text-[#b39a80]'
            }`}
          >
            {busy ? 'Claiming…' : `Claim ${status.reward}`}
          </button>
        )}
      </div>
      <ol className="m-0 grid list-none grid-cols-7 gap-1 p-0 text-center sm:gap-1.5">
        {STREAK_REWARDS.map((coins, i) => {
          const n = i + 1;
          const done = n <= status.streak;
          const today = n === Math.min(day, STREAK_REWARDS.length) && !status.claimedToday;
          return (
            <li
              key={n}
              className={`flex flex-col items-center gap-0.5 rounded-[10px] py-1.5 sm:py-2 ${
                today ? 'bg-[#ff8a3d] text-[#1a0f06]' : done ? 'bg-[#4a2c12] text-[#ffb27a]' : 'bg-[#211a12] text-[#c9b09a]'
              }`}
            >
              <span className="text-[10px] opacity-80 sm:text-[11px]">
                <span className="max-sm:hidden">Day </span>
                <span className="sm:hidden">D</span>
                {n}
              </span>
              <span className="text-[13px] font-semibold sm:text-sm">{coins}</span>
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
