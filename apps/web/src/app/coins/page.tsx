'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { availableGifts, BOOST, COIN_PACKS, INR_COIN_PRICES, inr, type CoinPackId, type SpendResult } from '@rc/shared';
import { payWithRazorpay, razorpayEnabled } from '@/lib/razorpay';
import { spendError, useWallet } from '@/components/Coins';
import { AppShell, ShellActions } from '@/components/AppShell';
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

  const [picked, setPicked] = useState<CoinPackId>('medium');
  const [confirm, setConfirm] = useState<'boost' | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const pack = COIN_PACKS.find((p) => p.id === picked)!;
  const gifts = availableGifts();
  const card = 'rounded-[18px] border border-line bg-card p-4 lg:rounded-[20px] lg:p-5';
  const coins = user?.wallet.coins ?? 0;
  const ask = (what: 'boost') => (user ? setConfirm(what) : router.push('/login?next=/coins'));
  const askBuy = () => (user && token ? setBuyOpen(true) : router.push('/signup?next=/coins'));

  return (
    <AppShell
      title="Coins"
      actions={
        <div className="flex items-center">
          {user?.plus.active ? (
            <span className="flex h-11 items-center rounded-full border border-[#4a3f17] bg-gold-bg px-3 text-xs font-semibold text-gold lg:hidden">Plus ✓</span>
          ) : (
            <Link
              href="/plus"
              className="flex h-11 items-center rounded-full border border-[#4a3f17] bg-gold-bg px-2.5 text-xs font-semibold text-gold lg:hidden"
            >
              Get Plus
            </Link>
          )}
          <div className="max-lg:hidden">
            <ShellActions />
          </div>
        </div>
      }
    >
      <div className="-mt-2 flex flex-col gap-3 lg:mt-0 lg:gap-5">
        {(notice || error || (!loading && !user)) && (
          <div className="flex flex-col gap-2 [&>p]:mt-0">
            {notice && <FormNote>{notice}</FormNote>}
            <FormError error={error} />
            {!loading && !user && (
              <p className={`m-0 text-center text-sm text-mute ${card}`}>
                <Link href="/signup?next=/coins" className="font-semibold text-lime underline underline-offset-2">
                  Create a free account
                </Link>{' '}
                to buy and keep coins.
              </p>
            )}
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-3 lg:gap-4">
          {/* Balance (Boost sits here on phones) */}
          <section aria-label="Your balance" className={`flex items-center justify-between gap-3 lg:flex-col lg:items-stretch lg:justify-start lg:gap-1.5 ${card}`}>
            <div className="flex min-w-0 flex-col lg:gap-1.5">
              <span className="text-xs text-mute lg:text-[13px]">
                <span className="lg:hidden">Balance</span>
                <span className="max-lg:hidden">Your balance</span>
              </span>
              <strong className="font-display text-[36px] font-bold leading-none text-gold lg:text-5xl">{coins.toLocaleString()}</strong>
              <span className="text-[13px] text-mute max-lg:hidden">Use for gifts and Boost</span>
            </div>
            <div className="lg:hidden">
              <BoostButton onAsk={() => ask('boost')} compact />
            </div>
          </section>
          {user ? (
            <DailyRewardCard className="lg:col-span-2" />
          ) : (
            <section aria-label="Daily streak" className={`flex flex-col justify-center gap-1 lg:col-span-2 ${card}`}>
              <strong className="font-display text-[15px] font-bold lg:text-[17px]">Daily streak</strong>
              <p className="m-0 text-xs text-mute lg:text-[13px]">
                <Link href="/login?next=/coins" className="text-lime underline underline-offset-2">
                  Log in
                </Link>{' '}
                to collect free coins every day.
              </p>
            </section>
          )}
        </div>

        {/* Buy coins: pick a pack, then one buy button */}
        <section id="buy" aria-labelledby="buy-title" className={`flex flex-col gap-3 max-lg:border-0 max-lg:bg-transparent max-lg:p-0 lg:gap-3.5 ${card}`}>
          <div className="flex items-center justify-between gap-3 max-lg:sr-only">
            <h2 id="buy-title" className="m-0 font-display text-[17px] font-bold">
              Buy coins
            </h2>
            <span className="text-[13px] text-mute">Secure payment by Stripe · no cash value</span>
          </div>
          <div role="radiogroup" aria-label="Coin pack" className="grid grid-cols-2 gap-2 lg:grid-cols-3 lg:gap-3">
            {COIN_PACKS.map((p) => {
              const on = p.id === picked;
              return (
                <button
                  key={p.id}
                  role="radio"
                  aria-checked={on}
                  aria-label={`${p.coins} coins, ${money(p.cents)}${p.tag ? `, ${p.tag}` : ''}`}
                  onClick={() => setPicked(p.id)}
                  className={`flex min-h-24 min-w-0 flex-col items-center justify-center gap-0.5 rounded-[14px] border-2 text-[#f4f5f7] transition lg:min-h-[150px] lg:gap-1 lg:rounded-2xl ${
                    on ? 'border-lime bg-pick' : 'border-divider bg-card-2 hover:border-line-2'
                  }`}
                >
                  <span className="min-h-3.5 text-[11px] text-gold lg:min-h-4 lg:text-xs">{p.tag}</span>
                  <strong className="font-display text-[22px] font-bold lg:text-[26px]">{p.coins.toLocaleString()}</strong>
                  <span className="text-[13px] text-mute max-lg:hidden">coins</span>
                  <span className="text-[13px] font-semibold text-mute lg:text-[15px] lg:text-[#f4f5f7]">
                    {money(p.cents)}
                    {upi && <span className="text-mute"> · {inr(INR_COIN_PRICES[p.id])}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-2 lg:flex-row-reverse lg:justify-start">
            <button
              type="button"
              onClick={askBuy}
              disabled={busy !== null}
              aria-haspopup="dialog"
              className="h-[52px] rounded-[14px] bg-lime px-8 font-display text-base font-bold text-night transition hover:bg-lime-hover disabled:opacity-50 lg:text-[17px]"
            >
              {busy ? 'Opening…' : `Buy ${pack.coins.toLocaleString()} coins`}
            </button>
          </div>
          <Link href="/invite" className="flex min-h-11 items-center justify-center text-sm text-lime lg:hidden">
            Or invite a friend for free Plus →
          </Link>
        </section>

        {/* Desktop: Boost */}
        <div className={`flex items-center justify-between gap-3 max-lg:hidden ${card}`}>
          <div>
            <strong className="font-display text-base font-bold">Boost · {BOOST.minutes} min</strong>
            <p className="m-0 mt-0.5 text-[13px] text-mute">Get matched first</p>
          </div>
          <BoostButton onAsk={() => ask('boost')} />
        </div>

        {/* What coins buy */}
        <section aria-labelledby="gifts-title" className={`flex flex-col gap-3 ${card}`}>
          <h2 id="gifts-title" className="m-0 font-display text-[15px] font-bold lg:text-[17px]">
            Gifts in a call
          </h2>
          <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-6">
            {gifts.map((g) => (
              <li key={g.id} className="relative flex flex-col items-center rounded-xl border border-divider bg-card-2 px-2 py-2.5 text-center">
                {g.season && (
                  <span className="absolute right-1.5 top-1.5 rounded bg-gold px-1 text-[9px] font-bold text-gold-bg" title={`${g.season.label} special`}>
                    NEW
                  </span>
                )}
                <span className="text-2xl leading-8" aria-hidden>
                  {g.emoji}
                </span>
                <span className="text-xs">{g.name}</span>
                <span className="text-[11px] text-gold">{g.coins} coins</span>
              </li>
            ))}
          </ul>
          {gifts.some((g) => g.season) && (
            <p className="m-0 text-xs text-gold">{gifts.find((g) => g.season)!.season!.label} specials are here for a limited time.</p>
          )}
          <p className="m-0 text-[11px] leading-normal text-faint">
            They receive half as coins. Coins have no cash value and can&apos;t be refunded or transferred, except as gifts in calls. See the{' '}
            <Link href="/terms" className="underline hover:text-mute">
              Terms
            </Link>
            .
          </p>
        </section>
      </div>
      {confirm && (
        <ConfirmSpend
          balance={coins}
          cost={BOOST.coins}
          title={`Use ${BOOST.coins} coins for Boost?`}
          body={`You will be matched first for the next ${BOOST.minutes} minutes.`}
          run={boost}
          done={`Boost on ✓ · you’re first in line for ${BOOST.minutes}:00`}
          onDone={(msg) => {
            setConfirm(null);
            if (msg) setNotice(msg);
          }}
          onBuy={() => {
            setConfirm(null);
            setBuyOpen(true);
          }}
        />
      )}
      {buyOpen && (
        <BuyDialog
          coins={pack.coins}
          price={money(pack.cents)}
          inrPrice={upi ? inr(INR_COIN_PRICES[pack.id]) : null}
          balance={coins}
          busy={busy !== null}
          onClose={() => setBuyOpen(false)}
          onStripe={() => void buy(pack.id)}
          onUpi={() => {
            setBuyOpen(false);
            void buyUpi(pack.id);
          }}
        />
      )}
    </AppShell>
  );
}

const timeLeft = (until: number) => {
  const m = Math.max(0, Math.round((until - Date.now()) / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

/** "29:59" until Boost ends (h:mm:ss past an hour). */
const clock = (until: number) => {
  const s = Math.max(0, Math.round((until - Date.now()) / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

const goldBtn =
  'inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-[#4a3f17] bg-gold-bg px-3.5 text-[13px] font-semibold text-gold transition hover:brightness-125 disabled:opacity-50 lg:px-4 lg:text-sm';

/** Boost: opens the confirm dialog, or shows how long it's still on. `compact` is the phone balance-card version. */
function BoostButton({ onAsk, compact = false }: { onAsk: () => void; compact?: boolean }) {
  const wallet = useWallet();
  const noteId = useId();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const active = wallet?.boostUntil && wallet.boostUntil > Date.now() ? wallet.boostUntil : null;
  // Tick every second while Boost runs, for the mm:ss countdown.
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1_000);
    return () => window.clearInterval(t);
  }, [active]);
  if (!wallet) {
    return (
      <Link href="/login?next=/coins" className={goldBtn}>
        Log in to Boost
      </Link>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <button
        aria-describedby={active ? noteId : undefined}
        aria-label={`${active ? 'Add' : 'Buy'} Boost, ${BOOST.minutes} minutes, ${BOOST.coins} coins`}
        onClick={onAsk}
        className={goldBtn}
      >
        {active ? `Boost on · ${clock(active)}` : compact ? `Boost · ${BOOST.coins}` : `Boost · ${BOOST.coins}`}
      </button>
      {active && (
        <p id={noteId} className="sr-only">
          Boost on · {timeLeft(active)} left. Tap to add more time.
        </p>
      )}
    </div>
  );
}

const ghostBtn =
  'h-[50px] flex-1 rounded-[14px] border-[1.5px] border-[#6B5D84] bg-transparent text-[15px] font-semibold text-[#e6e8ec] transition hover:border-[#5a4d70]';
const primaryBtn =
  'h-[50px] flex-[1.3] rounded-[14px] bg-lime font-display text-[15px] font-bold text-night transition hover:bg-lime-hover disabled:opacity-50';

/** "Use N coins for …?" — a centred dialog on desktop, a bottom sheet on phones. */
function ConfirmSpend({
  balance,
  cost,
  title,
  body,
  run,
  done,
  onDone,
  onBuy,
}: {
  balance: number;
  cost: number;
  title: string;
  body: string;
  run: () => Promise<SpendResult>;
  done: string;
  onDone: (msg: string | null) => void;
  onBuy: () => void;
}) {
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enough = balance >= cost;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);
  return (
    <div className="fixed inset-0 z-50">
      <div aria-hidden className="absolute inset-0 bg-[rgba(11,8,17,.72)]" onClick={() => onDone(null)} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-x-0 bottom-0 flex flex-col gap-3.5 rounded-t-3xl border-t border-divider bg-card px-5 pb-6 pt-2.5 lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:w-[440px] lg:max-w-[calc(100%-32px)] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[22px] lg:border lg:p-6 lg:shadow-[0_30px_80px_rgba(0,0,0,.6)]"
      >
        <span aria-hidden className="h-1 w-10 self-center rounded-sm bg-line-2 lg:hidden" />
        <h2 id={titleId} className="m-0 font-display text-xl font-bold">
          {title}
        </h2>
        <p className="m-0 text-sm text-mute">{body}</p>
        <div className="flex justify-between rounded-xl bg-card-2 px-3.5 py-3 text-sm">
          <span>Balance</span>
          <b className="text-gold">
            {balance.toLocaleString()} → {(balance - cost).toLocaleString()} coins
          </b>
        </div>
        {!enough && <p className="m-0 text-[13px] text-stop-text">Not enough coins.</p>}
        {error && (
          <p role="alert" className="m-0 text-[13px] text-stop-text">
            {error}
          </p>
        )}
        <div className="flex gap-2.5">
          <button type="button" onClick={() => onDone(null)} className={ghostBtn}>
            Cancel
          </button>
          {enough ? (
            <button
              type="button"
              disabled={busy}
              autoFocus
              onClick={async () => {
                setBusy(true);
                setError(null);
                const r = await run();
                setBusy(false);
                if (r.ok) onDone(done);
                else setError(spendError(r));
              }}
              className={primaryBtn}
            >
              {busy ? 'Working…' : `Confirm · ${cost} coins`}
            </button>
          ) : (
            <button type="button" autoFocus onClick={onBuy} className={primaryBtn}>
              Buy coins
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

/** "Buy N coins?" — confirms the pack before handing off to the real checkout (Stripe, or Razorpay for UPI). */
function BuyDialog({
  coins,
  price,
  inrPrice,
  balance,
  busy,
  onClose,
  onStripe,
  onUpi,
}: {
  coins: number;
  price: string;
  inrPrice: string | null;
  balance: number;
  busy: boolean;
  onClose: () => void;
  onStripe: () => void;
  onUpi: () => void;
}) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const row = 'flex justify-between gap-3 rounded-xl bg-card-2 px-3.5 py-3 text-sm';
  return (
    <div className="fixed inset-0 z-50">
      <div aria-hidden className="absolute inset-0 bg-[rgba(11,8,17,.72)]" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-x-0 bottom-0 flex flex-col gap-3 rounded-t-3xl border-t border-divider bg-card px-5 pb-6 pt-2.5 lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:w-[440px] lg:max-w-[calc(100%-32px)] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[22px] lg:border lg:p-6 lg:shadow-[0_30px_80px_rgba(0,0,0,.6)]"
      >
        <span aria-hidden className="h-1 w-10 self-center rounded-sm bg-line-2 lg:hidden" />
        <h2 id={titleId} className="m-0 font-display text-[22px] font-bold">
          Buy {coins.toLocaleString()} coins?
        </h2>
        <div className={row}>
          <span>Price</span>
          <b>
            {price}
            {inrPrice && <span className="font-normal text-mute"> · {inrPrice}</span>}
          </b>
        </div>
        <div className={row}>
          <span>Pay with</span>
          <b className="text-right">{inrPrice ? 'Card (Stripe) or UPI' : 'Card · Stripe checkout'}</b>
        </div>
        <div className={row}>
          <span>Balance</span>
          <b className="text-gold">
            {balance.toLocaleString()} → {(balance + coins).toLocaleString()} coins
          </b>
        </div>
        <p className="m-0 text-xs text-mute">Secure payment by Stripe. Coins have no cash value and can’t be refunded once used.</p>
        <div className="flex gap-2.5">
          <button type="button" onClick={onClose} className="h-[52px] flex-1 rounded-[14px] border-[1.5px] border-[#6B5D84] text-[15px] font-semibold text-[#e6e8ec] transition hover:border-lime">
            Cancel
          </button>
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={onStripe}
            className="h-[52px] flex-[1.4] rounded-[14px] bg-lime font-display text-base font-bold text-night transition hover:bg-lime-hover disabled:opacity-50"
          >
            {busy ? 'Opening…' : `Pay ${price}`}
          </button>
        </div>
        {inrPrice && (
          <button
            type="button"
            disabled={busy}
            onClick={onUpi}
            className="h-11 rounded-[14px] text-sm font-semibold text-lime underline-offset-2 hover:underline disabled:opacity-50"
          >
            Pay {inrPrice} with UPI / card instead
          </button>
        )}
      </section>
    </div>
  );
}
