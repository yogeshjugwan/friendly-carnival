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
          ? `chat:${status.reward}`
          : 'Your reward is ready!');
  return (
    <section
      aria-label="Daily streak"
      className={`flex flex-col gap-2.5 rounded-[18px] border border-line bg-card p-4 lg:gap-3 lg:rounded-[20px] lg:p-5 ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 font-display text-[15px] font-bold text-[#f4f5f7] lg:text-[17px]">
            Daily streak<span className="max-lg:hidden"> · Day {Math.min(day, STREAK_REWARDS.length)}</span>
          </h2>
          <p className="m-0 mt-0.5 text-xs text-mute lg:text-[13px]" aria-live="polite">
            {hint.startsWith('chat:') ? (
              <>
                <span className="lg:hidden">
                  Day {Math.min(day, STREAK_REWARDS.length)} · one chat today unlocks {status.reward}
                </span>
                <span className="max-lg:hidden">Have one chat today to unlock {status.reward} coins</span>
              </>
            ) : (
              hint
            )}
          </p>
        </div>
        {status.claimedToday ? (
          <span className="flex h-11 shrink-0 items-center rounded-[10px] border border-line px-3 text-[13px] font-semibold text-lime lg:h-11 lg:rounded-xl lg:px-[18px] lg:text-sm">
            Claimed ✓
          </span>
        ) : (
          <button
            onClick={() => void claim()}
            disabled={busy || !canClaim}
            aria-label={`Claim ${status.reward} coins`}
            className={`h-11 shrink-0 rounded-[10px] px-3 text-[13px] font-semibold transition lg:rounded-xl lg:px-[18px] lg:text-sm ${
              canClaim ? 'bg-lime text-night hover:bg-lime-hover' : 'cursor-not-allowed bg-line-2 text-[#8a8f99]'
            }`}
          >
            {busy ? (
              'Claiming…'
            ) : (
              <>
                Claim {status.reward}
              </>
            )}
          </button>
        )}
      </div>
      <ol className="m-0 grid list-none grid-cols-7 gap-1 p-0 text-center lg:gap-2">
        {STREAK_REWARDS.map((coins, i) => {
          const n = i + 1;
          const done = n <= status.streak;
          const today = n === Math.min(day, STREAK_REWARDS.length) && !status.claimedToday;
          return (
            <li
              key={n}
              aria-current={today ? 'step' : undefined}
              className={`flex flex-col items-center gap-0.5 rounded-[10px] border py-1.5 lg:rounded-xl lg:px-1.5 lg:py-2.5 ${
                today ? 'border-lime bg-pick' : done ? 'border-[#2E5A3C] bg-[#16301F]' : 'border-divider bg-card-2'
              }`}
            >
              <span className="text-[11px] text-mute">
                <span className="max-lg:hidden">Day </span>
                <span className="lg:hidden">D</span>
                {n}
              </span>
              <strong className={`font-display text-[13px] font-bold lg:text-base text-[#f4f5f7]`}>
                <span className="max-lg:hidden">+</span>
                {coins}
              </strong>
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
