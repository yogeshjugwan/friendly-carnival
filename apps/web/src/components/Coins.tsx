'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { availableGifts, BOOST, GIFTS, type SpendResult, type Wallet } from '@rc/shared';
import { useAuth } from '@/lib/auth';
import type { RandomCall } from '@/lib/useRandomCall';

const REASON: Record<Extract<SpendResult, { ok: false }>['reason'], string> = {
  login: 'Log in to use coins.',
  coins: 'Not enough coins.',
  'no-partner': 'Start a chat first.',
  invalid: 'Something went wrong. Try again.',
};
export const spendError = (r: SpendResult) => (r.ok ? null : REASON[r.reason]);

/** The wallet: live from the call socket when available, else from the account. */
export function useWallet(call?: RandomCall): Wallet | null {
  const { user } = useAuth();
  if (!user) return null;
  return call?.wallet ?? user.wallet ?? { coins: 0, boostUntil: null };
}

/** 🪙 balance chip (links to the coins page; new tab during a call so it doesn't end). */
export function CoinChip({ call, className = '' }: { call?: RandomCall; className?: string }) {
  const wallet = useWallet(call);
  if (!wallet) return null;
  const boosted = wallet.boostUntil && wallet.boostUntil > Date.now();
  return (
    <Link
      href="/coins"
      target={call ? '_blank' : undefined}
      title={boosted ? 'Coins · Boost is on' : 'Coins'}
      className={`flex items-center gap-1 rounded-full bg-[#3c4043] px-3 py-2 text-sm font-semibold text-amber-200 hover:bg-[#4a4e52] ${className}`}
    >
      <span aria-hidden>🪙</span>
      {wallet.coins.toLocaleString()}
      {boosted && <span aria-label="Boost on">🚀</span>}
    </Link>
  );
}

/** 🎁 on the video: pick a gift for the partner. */
export function GiftButton({ call }: { call: RandomCall }) {
  const wallet = useWallet(call);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
          setError(null);
        }}
        className="rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-amber-100 hover:bg-black/80"
        aria-expanded={open}
      >
        🎁 Gift
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-full z-40 mt-2 w-72 max-w-[85vw] rounded-xl bg-[#2a2b2e] p-3 text-slate-100 shadow-2xl">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold">Send a gift</span>
              {wallet ? (
                <span className="text-amber-200">🪙 {wallet.coins.toLocaleString()}</span>
              ) : (
                <Link href="/login" target="_blank" className="text-xs text-sky-300 underline">
                  Log in
                </Link>
              )}
            </div>
            <div className="grid max-h-56 grid-cols-5 gap-1.5 overflow-y-auto">
              {availableGifts().map((g) => (
                <button
                  key={g.id}
                  disabled={!!busy || !wallet || wallet.coins < g.coins}
                  onClick={async () => {
                    setBusy(g.id);
                    setError(null);
                    const r = await call.sendGift(g.id);
                    setBusy(null);
                    const err = spendError(r);
                    if (err) setError(err);
                    else setOpen(false);
                  }}
                  title={`${g.name} · ${g.coins} coins${g.season ? ` · ${g.season.label} special` : ''}`}
                  className="flex flex-col items-center rounded-lg py-1.5 transition hover:bg-white/10 disabled:opacity-40"
                >
                  <span className="relative text-2xl">
                    {g.emoji}
                    {g.season && <span className="absolute -right-1.5 -top-1 rounded bg-amber-400 px-0.5 text-[8px] font-bold text-black">NEW</span>}
                  </span>
                  <span className="text-[10px] text-amber-200">{g.coins}</span>
                </button>
              ))}
            </div>
            {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
            <p className="mt-2 text-[11px] text-slate-400">
              They get half as coins.{' '}
              <Link href="/coins" target="_blank" className="text-sky-300 underline">
                Get coins
              </Link>
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/** Big gift animation over the video, on both screens. */
export function GiftLayer({ call }: { call: RandomCall }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center" aria-live="polite">
      {call.gifts.map((g) => {
        const gift = GIFTS.find((x) => x.id === g.giftId);
        if (!gift) return null;
        return (
          <div key={g.id} className="rc-gift-pop absolute flex flex-col items-center text-center">
            <span className="text-8xl drop-shadow-2xl sm:text-9xl">{gift.emoji}</span>
            <span className="mt-2 rounded-full bg-black/60 px-3 py-1 text-sm font-semibold text-white">
              {g.from === 'me' ? `You sent a ${gift.name}` : `You got a ${gift.name}!${g.earned ? ` +${g.earned} 🪙` : ''}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const timeLeft = (until: number) => {
  const m = Math.max(0, Math.round((until - Date.now()) / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

/** 🚀 Boost: shows status, or buys it. */
export function BoostCard({ call, buy }: { call?: RandomCall; buy: () => Promise<SpendResult> }) {
  const wallet = useWallet(call);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const active = wallet?.boostUntil && wallet.boostUntil > Date.now() ? wallet.boostUntil : null;
  return (
    <div className="rounded-xl bg-gradient-to-br from-fuchsia-600 to-indigo-600 p-4 text-white">
      <p className="text-lg font-bold">🚀 Boost</p>
      <p className="mt-1 text-sm text-white/90">
        Be matched first for {BOOST.minutes} minutes. {active ? `On for ${timeLeft(active)} more.` : ''}
      </p>
      {wallet ? (
        <button
          disabled={busy || wallet.coins < BOOST.coins}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const r = await buy();
            setBusy(false);
            setError(spendError(r));
          }}
          className="mt-3 rounded-full bg-white px-4 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50"
        >
          {busy ? 'Boosting…' : `${active ? 'Add' : 'Boost'} ${BOOST.minutes} min · 🪙 ${BOOST.coins}`}
        </button>
      ) : (
        <Link href="/login?next=/coins" className="mt-3 inline-block rounded-full bg-white px-4 py-2 text-sm font-semibold text-indigo-700">
          Log in to Boost
        </Link>
      )}
      {wallet && wallet.coins < BOOST.coins && <p className="mt-2 text-xs text-white/80">You need {BOOST.coins} coins.</p>}
      {error && <p className="mt-2 text-xs text-red-100">{error}</p>}
    </div>
  );
}
