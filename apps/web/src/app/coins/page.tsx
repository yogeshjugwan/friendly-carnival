'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { availableGifts, BOOST, COIN_PACKS, INR_COIN_PRICES, inr, MATCHES_FOR_COINS, type CoinPackId, type SpendResult } from '@rc/shared';
import { payWithRazorpay, razorpayEnabled } from '@/lib/razorpay';
import { spendError, useWallet } from '@/components/Coins';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { errorText, FormError, FormNote } from '@/components/forms/fields';
import { api, useAuth } from '@/lib/auth';
import { getSocket } from '@/lib/socket';
import { DailyRewardCard } from '@/components/DailyReward';

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export default function CoinsPage() {
  const { user, token, loading, refresh } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState<CoinPackId | `upi:${CoinPackId}` | null>(null);
  const [upi, setUpi] = useState(false);
  useEffect(() => {
    void razorpayEnabled().then(setUpi);
  }, []);

  /** India: Razorpay (UPI, cards, wallets) in rupees. */
  const buyUpi = async (pack: CoinPackId) => {
    if (!user || !token) return router.push('/signup?next=/coins');
    setBusy(`upi:${pack}`);
    setError(null);
    try {
      const done = await payWithRazorpay(`coins:${pack}`, token, { email: user.email }, `${COIN_PACKS.find((p) => p.id === pack)!.coins} coins`);
      if (done === 'paid') {
        await refresh();
        setNotice('Payment received — your coins are in! 🪙');
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Back from Stripe: the webhook credits coins within a few seconds.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('canceled')) setNotice('Payment canceled — no coins were charged.');
    if (!q.get('success') || loading || !token) return;
    setNotice('Payment received! Adding your coins…');
    let tries = 0;
    const t = window.setInterval(async () => {
      tries++;
      await refresh().catch(() => undefined);
      if (tries >= 10) window.clearInterval(t);
    }, 2_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, token]);

  const buy = async (pack: CoinPackId) => {
    if (!user || !token) return router.push('/signup?next=/coins');
    setBusy(pack);
    setError(null);
    try {
      const { url } = await api<{ url: string }>('/billing/coins', { pack }, token);
      window.location.href = url;
    } catch (e) {
      setError(errorText(e));
      setBusy(null);
    }
  };

  const boost = () =>
    new Promise<SpendResult>((resolve) =>
      getSocket()
        .timeout(8_000)
        .emit('boost:buy', (err, r) => {
          const res: SpendResult = err ? { ok: false, reason: 'invalid' } : r;
          if (res.ok) void refresh();
          resolve(res);
        }),
    );

  const plusOn = user?.plus.active;
  const gifts = availableGifts();

  return (
    <main className="mx-auto flex min-h-full w-full max-w-[1200px] flex-col gap-4 px-4 py-5 sm:gap-6 sm:px-6 sm:py-6">
      <SiteHeader />
      <div className="flex items-center justify-between gap-3 sm:hidden">
        <h1 className="m-0 font-display text-[26px] font-bold">Coins</h1>
        {plusOn && <span className="rounded-full bg-gold-bg px-2.5 py-1.5 text-xs font-semibold text-gold">PLUS</span>}
      </div>
      <h1 className="sr-only max-sm:hidden">Coins</h1>

      {(notice || error || (!loading && !user)) && (
        <div className="flex flex-col gap-2 [&>p]:mt-0">
          {notice && <FormNote>{notice}</FormNote>}
          <FormError error={error} />
          {!loading && !user && (
            <p className="m-0 rounded-[18px] border border-line bg-card p-4 text-center text-sm text-mute">
              <Link href="/signup?next=/coins" className="font-semibold text-lime underline underline-offset-2">
                Create a free account
              </Link>{' '}
              to buy and keep coins.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
          {/* Balance + Boost */}
          <section
            aria-label="Your balance"
            className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-line bg-card p-[18px] sm:rounded-[20px] sm:p-7"
          >
            <div className="min-w-0">
              <p className="m-0 text-xs text-mute sm:text-[13px]">
                <span className="sm:hidden">Balance</span>
                <span className="max-sm:hidden">Your balance</span>
              </p>
              <p className="m-0 font-display text-[40px] font-bold leading-[1.1] sm:text-[64px]">
                {user ? user.wallet.coins.toLocaleString() : '—'}{' '}
                <span className="text-2xl text-gold max-sm:hidden">coins</span>
              </p>
              <p className="m-0 text-sm text-dim max-sm:hidden">Gifts, Boost and extra matches</p>
            </div>
            <BoostButton buy={boost} />
          </section>

          {/* Packs: rows on phones, three cards from sm up */}
          <section aria-label="Coin packs" className="grid gap-2.5 sm:grid-cols-3 sm:gap-4">
            {COIN_PACKS.map((p) => {
              const best = p.tag === 'Best value';
              return (
                <div
                  key={p.id}
                  className={`relative flex items-center gap-3 rounded-[18px] border bg-card px-4 py-3.5 sm:flex-col sm:items-stretch sm:gap-1.5 sm:rounded-[20px] sm:p-[22px] ${
                    best ? 'border-gold' : 'border-line'
                  }`}
                >
                  {p.tag && (
                    <span className="absolute -top-[11px] left-5 rounded-full bg-gold px-2.5 py-[3px] text-[11px] font-semibold text-gold-bg max-sm:hidden">
                      {p.tag}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="m-0 font-display text-xl font-bold sm:text-[30px] sm:leading-tight">
                      {p.coins.toLocaleString()}
                      <span className="sm:hidden"> coins</span>
                    </p>
                    <p className="m-0 text-[13px] text-dim max-sm:hidden">coins</p>
                    {p.tag && <p className="m-0 text-xs text-gold sm:hidden">{p.tag}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 sm:mt-3">
                    <button
                      onClick={() => void buy(p.id)}
                      disabled={busy !== null}
                      aria-label={`Buy ${p.coins} coins for ${money(p.cents)}`}
                      className={`h-11 min-w-[92px] rounded-xl px-3 text-sm font-bold transition disabled:opacity-50 sm:text-[15px] ${
                        best ? 'bg-gold text-gold-bg hover:brightness-110' : 'bg-line text-[#f4f5f7] hover:bg-line-2'
                      }`}
                    >
                      {busy === p.id ? 'Opening…' : money(p.cents)}
                    </button>
                    {upi && (
                      <button
                        onClick={() => void buyUpi(p.id)}
                        disabled={busy !== null}
                        aria-label={`Buy ${p.coins} coins for ${inr(INR_COIN_PRICES[p.id])} with UPI or card`}
                        className="h-11 min-w-[92px] rounded-xl border border-line-2 px-3 text-[13px] font-semibold text-mute transition hover:border-lime hover:text-lime disabled:opacity-50"
                      >
                        {busy === `upi:${p.id}` ? (
                          'Opening…'
                        ) : (
                          <>
                            {inr(INR_COIN_PRICES[p.id])} · UPI<span className="max-sm:hidden"> / card</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>

          {user && <DailyRewardCard />}
        </div>

        {/* What coins buy */}
        <section aria-labelledby="gifts-title" className="flex min-w-0 flex-col gap-3.5 rounded-[18px] border border-line bg-card p-4 sm:rounded-[20px] sm:p-6">
          <h2 id="gifts-title" className="m-0 font-display text-[15px] font-bold sm:text-lg">
            Gifts in a call
          </h2>
          <ul className="m-0 grid list-none grid-cols-3 gap-2.5 p-0 sm:grid-cols-4 lg:grid-cols-3">
            {gifts.map((g) => (
              <li key={g.id} className="relative flex flex-col items-center rounded-[14px] bg-card-2 px-2 py-3.5 text-center">
                {g.season && (
                  <span className="absolute right-1.5 top-1.5 rounded bg-gold px-1 text-[9px] font-bold text-gold-bg" title={`${g.season.label} special`}>
                    NEW
                  </span>
                )}
                <span className="text-[28px] leading-9" aria-hidden>
                  {g.emoji}
                </span>
                <span className="mt-1 text-[13px]">{g.name}</span>
                <span className="text-xs text-gold">{g.coins} coins</span>
              </li>
            ))}
          </ul>
          {gifts.some((g) => g.season) && (
            <p className="m-0 text-xs text-gold">{gifts.find((g) => g.season)!.season!.label} specials are here for a limited time.</p>
          )}
          <p className="m-0 text-[13px] leading-normal text-dim">
            They receive half as coins. Out of free matches? {MATCHES_FOR_COINS.coins} coins = {MATCHES_FOR_COINS.matches} more today.
          </p>
          <p className="m-0 mt-auto pt-2 text-[11px] leading-normal text-faint">
            Secure payment by Stripe. Coins have no cash value and can&apos;t be refunded or transferred, except as gifts in calls. See the{' '}
            <Link href="/terms" className="underline hover:text-mute">
              Terms
            </Link>
            .
          </p>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}

const timeLeft = (until: number) => {
  const m = Math.max(0, Math.round((until - Date.now()) / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

/** Boost in the balance card: buys it, or shows how long it's still on. */
function BoostButton({ buy }: { buy: () => Promise<SpendResult> }) {
  const wallet = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const active = wallet?.boostUntil && wallet.boostUntil > Date.now() ? wallet.boostUntil : null;
  const btn =
    'inline-flex h-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#B04CF0,#5B4BF0)] px-3.5 font-display text-[13px] font-bold text-white transition hover:brightness-110 disabled:opacity-50 sm:h-[52px] sm:rounded-[14px] sm:px-[22px] sm:text-[15px]';
  const short = wallet && wallet.coins < BOOST.coins;
  return (
    <div className="flex flex-col items-end gap-1 text-right">
      {wallet ? (
        <button
          disabled={busy || !!short}
          aria-describedby="boost-note"
          onClick={async () => {
            setBusy(true);
            setError(null);
            const r = await buy();
            setBusy(false);
            setError(spendError(r));
          }}
          className={btn}
        >
          {busy ? (
            'Boosting…'
          ) : (
            <>
              {active ? 'Add' : 'Boost'}
              <span className="max-sm:hidden">&nbsp;{BOOST.minutes} min</span>&nbsp;· {BOOST.coins}
            </>
          )}
        </button>
      ) : (
        <Link href="/login?next=/coins" className={btn}>
          Log in to Boost
        </Link>
      )}
      <p id="boost-note" className="m-0 max-w-[220px] text-[11px] text-dim sm:text-xs">
        {active ? `Boost on · ${timeLeft(active)} left` : short ? `You need ${BOOST.coins} coins` : `Matched first for ${BOOST.minutes} min`}
      </p>
      {error && (
        <p role="alert" className="m-0 text-xs text-stop-text">
          {error}
        </p>
      )}
    </div>
  );
}
