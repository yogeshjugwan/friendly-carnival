'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { availableGifts, COIN_PACKS, INR_COIN_PRICES, inr, MATCHES_FOR_COINS, type CoinPackId, type SpendResult } from '@rc/shared';
import { payWithRazorpay, razorpayEnabled } from '@/lib/razorpay';
import { BoostCard } from '@/components/Coins';
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

  return (
    <main className="mx-auto flex min-h-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <SiteHeader />
      <section className="mt-2 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-400">randomCall coins</p>
        <h1 className="mt-2 text-4xl font-bold">🪙 {user ? user.wallet.coins.toLocaleString() : '—'}</h1>
        <p className="mt-2 text-slate-300">Send gifts, Boost yourself, or get extra matches.</p>
      </section>

      {notice && <FormNote>{notice}</FormNote>}
      <FormError error={error} />

      {!loading && !user && (
        <p className="rounded-xl bg-white/5 p-4 text-center text-slate-300">
          <Link href="/signup?next=/coins" className="font-semibold text-sky-300 underline">
            Create a free account
          </Link>{' '}
          to buy and keep coins.
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        {COIN_PACKS.map((p) => (
          <div key={p.id} className={`relative rounded-2xl bg-white p-6 text-center text-ink ${p.tag === 'Best value' ? 'ring-4 ring-amber-400' : ''}`}>
            {p.tag && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-3 py-0.5 text-xs font-semibold text-white">{p.tag}</span>}
            <p className="text-4xl">🪙</p>
            <p className="mt-2 text-2xl font-bold">{p.coins.toLocaleString()} coins</p>
            <p className="text-sm text-slate-500">{money(p.cents)}</p>
            <button
              onClick={() => void buy(p.id)}
              disabled={busy !== null}
              className="mt-4 w-full rounded-lg bg-amber-500 py-2.5 font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {busy === p.id ? 'Opening checkout…' : `Buy for ${money(p.cents)}`}
            </button>
            {upi && (
              <button
                onClick={() => void buyUpi(p.id)}
                disabled={busy !== null}
                className="mt-2 w-full rounded-lg border-2 border-emerald-500 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                {busy === `upi:${p.id}` ? 'Opening…' : `Pay ${inr(INR_COIN_PRICES[p.id])} · UPI / card`}
              </button>
            )}
          </div>
        ))}
      </section>

      {user && <DailyRewardCard />}

      <section className="grid gap-4 md:grid-cols-2">
        <BoostCard buy={boost} />
        <div className="rounded-xl bg-white/5 p-4 text-slate-200">
          <p className="text-lg font-bold">What coins do</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            <li>
              🎁 Gifts in a call: {availableGifts().map((g) => `${g.emoji} ${g.coins}`).join(' · ')} — they get half as coins.
              {availableGifts().some((g) => g.season) && (
                <span className="ml-1 rounded bg-amber-400 px-1 text-[11px] font-bold text-black">
                  {availableGifts().find((g) => g.season)!.season!.label} specials
                </span>
              )}
            </li>
            <li>🚀 Boost: be matched first for 30 minutes.</li>
            <li>
              ➕ Out of free matches? {MATCHES_FOR_COINS.coins} coins = {MATCHES_FOR_COINS.matches} more today.
            </li>
          </ul>
        </div>
      </section>

      <p className="text-center text-xs text-slate-500">
        Secure payment by Stripe. Coins have no cash value and can&apos;t be refunded or transferred, except as gifts in calls. See the{' '}
        <Link href="/terms" className="underline">
          Terms
        </Link>
        .
      </p>
      <SiteFooter />
    </main>
  );
}
