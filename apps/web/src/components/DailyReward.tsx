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
  return (
    <section className={`rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500 p-4 text-white ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-lg font-bold">🔥 {status.streak}-day streak</p>
        {status.claimedToday ? (
          <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">Claimed ✓</span>
        ) : (
          <button
            onClick={() => void claim()}
            disabled={busy || status.needsChat || status.needsEmail}
            className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-rose-600 disabled:opacity-60"
          >
            {busy ? 'Claiming…' : `Claim ${status.reward} 🪙`}
          </button>
        )}
      </div>
      <ol className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px]">
        {STREAK_REWARDS.map((coins, i) => {
          const n = i + 1;
          const done = n <= status.streak;
          const today = n === Math.min(day, STREAK_REWARDS.length) && !status.claimedToday;
          return (
            <li key={n} className={`rounded-lg py-1.5 ${done ? 'bg-white/35' : today ? 'bg-white text-rose-600' : 'bg-white/15'}`}>
              <span className="block font-semibold">Day {n}</span>
              {coins}🪙
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-white/90">
        {message ??
          (status.claimedToday
            ? 'Come back tomorrow to keep your streak.'
            : status.needsEmail
              ? 'Confirm your email to start collecting.'
              : status.needsChat
                ? 'Have one chat today to unlock your reward.'
                : 'Your reward is ready!')}
      </p>
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
