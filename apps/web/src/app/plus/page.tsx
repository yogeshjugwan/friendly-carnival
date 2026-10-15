'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { inr, PLUS_PASSES, PLUS_TRIAL_HOURS, type PlanPrice, type PlusPlan } from '@rc/shared';
import { payWithRazorpay, razorpayEnabled } from '@/lib/razorpay';
import { PlusFeatureList } from '@/components/PlusUpsell';
import { CrownIcon } from '@/components/UiIcons';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { errorText, FormError, FormNote } from '@/components/forms/fields';
import { api, useAuth } from '@/lib/auth';

const PLAN_INFO: Record<PlusPlan, { name: string; label: string; tag?: string; fallback: PlanPrice }> = {
  week: { name: '1 week', label: 'Weekly', fallback: { plan: 'week', amount: 799, currency: 'usd', interval: 'week', intervalCount: 1 } },
  month: { name: '1 month', label: 'Monthly', tag: 'Popular', fallback: { plan: 'month', amount: 1999, currency: 'usd', interval: 'month', intervalCount: 1 } },
  halfyear: { name: '6 months', label: '6 months', tag: 'Best value', fallback: { plan: 'halfyear', amount: 2990, currency: 'usd', interval: 'month', intervalCount: 6 } },
};

// A fixed locale, so the server-rendered price matches the browser's ("$7.99", "₹299.00").
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount / 100);

/** Price per week, so plans of different lengths compare fairly. */
const perWeek = (p: PlanPrice) => {
  const weeks = p.interval === 'week' ? p.intervalCount : (p.intervalCount * 52) / 12;
  return money(Math.round(p.amount / weeks), p.currency);
};

const billedText = (p: PlanPrice) =>
  p.interval === 'week'
    ? `${money(p.amount, p.currency)} billed weekly`
    : p.intervalCount === 1
      ? `${money(p.amount, p.currency)} billed monthly`
      : `${money(p.amount, p.currency)} every ${p.intervalCount} months`;

export default function PlusPage() {
  const { user, token, loading, refresh } = useAuth();
  const router = useRouter();
  const [plans, setPlans] = useState<PlanPrice[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState<PlusPlan | 'portal' | `upi:${PlusPlan}` | null>(null);
  const [upi, setUpi] = useState(false);
  useEffect(() => {
    void razorpayEnabled().then(setUpi);
  }, []);
  const [trialBusy, setTrialBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [picked, setPicked] = useState<PlusPlan>('month');

  useEffect(() => {
    api<{ enabled: boolean; plans: PlanPrice[] }>('/billing/plans')
      .then((r) => {
        setEnabled(r.enabled);
        setPlans(r.enabled ? r.plans : null);
      })
      .catch(() => setEnabled(false));
  }, []);

  // Back from Stripe Checkout: Plus turns on when Stripe's webhook arrives (usually seconds).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('canceled')) setNotice('Checkout canceled — you were not charged.');
    if (!params.has('success') || loading || !token) return;
    setWaiting(true);
    let tries = 0;
    const timer = window.setInterval(() => {
      tries++;
      void refresh().catch(() => undefined);
      if (tries >= 15) {
        window.clearInterval(timer);
        setWaiting(false);
        setNotice('Payment received. Plus can take a minute to activate — refresh this page shortly.');
      }
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [loading, token, refresh]);

  useEffect(() => {
    if (user?.plus.active && waiting) {
      setWaiting(false);
      setNotice('Welcome to Plus! 👑 Your filters are unlocked and ads are gone.');
    }
  }, [user, waiting]);

  const subscribe = async (plan: PlusPlan) => {
    if (!user || !token) return router.push('/signup?next=/plus');
    setBusy(plan);
    setError(null);
    try {
      const { url } = await api<{ url: string }>('/billing/checkout', { plan }, token);
      window.location.href = url;
    } catch (e) {
      setError(errorText(e));
      setBusy(null);
    }
  };

  const manage = async () => {
    if (!token) return;
    setBusy('portal');
    setError(null);
    try {
      const { url } = await api<{ url: string }>('/billing/portal', {}, token);
      window.location.href = url;
    } catch (e) {
      setError(errorText(e));
      setBusy(null);
    }
  };

  const shown = (['week', 'month', 'halfyear'] as PlusPlan[]).map((plan) => plans?.find((p) => p.plan === plan) ?? PLAN_INFO[plan].fallback);
  const plus = user?.plus;

  const chosen = shown.find((p) => p.plan === picked)!;
  const card = 'rounded-[18px] border border-line bg-card p-4 sm:rounded-[20px] sm:p-6';

  return (
    <main className="mx-auto flex min-h-full w-full max-w-[1100px] flex-col gap-5 bg-[radial-gradient(circle_at_50%_0%,#2A220A_0,#07080B_420px)] px-4 py-5 sm:gap-6 sm:px-6 sm:py-6">
      <SiteHeader />

      <div className="grid gap-6 lg:mt-6 lg:grid-cols-2 lg:gap-12">
        {/* Pitch */}
        <section className="flex flex-col gap-[18px]">
          <span className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-gold text-gold-bg">
            <CrownIcon className="h-[34px] w-[34px]" />
          </span>
          <h1 className="m-0 font-display text-[34px] font-bold leading-[1.05] sm:text-[44px]">
            Get <span className="text-gold">Plus</span>.
            <br />
            Meet who you want.
          </h1>
          <p className="m-0 text-sm text-mute">Filters, no ads, and a Plus badge. Cancel any time.</p>
          <PlusFeatureList />
        </section>

        {/* Buy / manage */}
        <section aria-label="Plans" className="flex min-w-0 flex-col gap-4 lg:justify-end">
          {(notice || waiting || error) && (
            <div className="flex flex-col gap-2 [&>p]:mt-0">
              {notice && <FormNote>{notice}</FormNote>}
              {waiting && <p className="text-center text-sm text-mute">Activating your Plus membership…</p>}
              <FormError error={error} />
            </div>
          )}

          {user?.trialAvailable && !plus?.active && (
            <div className="flex flex-col gap-3 rounded-[18px] border border-gold/40 bg-gold-bg p-4 sm:flex-row sm:items-center sm:rounded-[20px]">
              <div className="min-w-0 flex-1">
                <p className="m-0 font-display text-base font-bold text-gold">Try Plus free for {PLUS_TRIAL_HOURS} hours</p>
                <p className="m-0 mt-0.5 text-[13px] text-mute">
                  No card needed. Filters, no ads, see who&apos;s online — then decide.
                  {!user.emailVerified && ' Confirm your email first.'}
                </p>
              </div>
              <button
                disabled={trialBusy || !user.emailVerified}
                onClick={async () => {
                  setTrialBusy(true);
                  setError(null);
                  try {
                    await api('/auth/plus/trial', {}, token);
                    await refresh();
                    setNotice(`👑 Plus is on for the next ${PLUS_TRIAL_HOURS} hours. Enjoy!`);
                  } catch (e) {
                    setError(errorText(e));
                  } finally {
                    setTrialBusy(false);
                  }
                }}
                className="h-11 shrink-0 rounded-xl border border-gold px-4 text-sm font-semibold text-gold transition hover:bg-gold hover:text-gold-bg disabled:opacity-50"
              >
                {trialBusy ? 'Starting…' : 'Start free trial'}
              </button>
            </div>
          )}

          {plus?.active ? (
            <div className={card}>
              <h2 className="m-0 flex items-center gap-2 font-display text-xl font-bold">
                <CrownIcon className="h-5 w-5 text-gold" /> You have Plus
              </h2>
              <p className="m-0 mt-2 text-sm text-mute">
                {plus.status === 'admin'
                  ? `Complimentary Plus until ${new Date(plus.until!).toLocaleDateString()}.`
                  : plus.status === 'pass'
                    ? `Your Plus pass lasts until ${new Date(plus.until!).toLocaleDateString()} (no auto-renew).`
                    : plus.cancelAtPeriodEnd
                      ? `Your plan ends on ${new Date(plus.until!).toLocaleDateString()} and will not renew.`
                      : `Your ${plus.plan ? PLAN_INFO[plus.plan].name : ''} plan renews on ${new Date(plus.until!).toLocaleDateString()}.`}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/"
                  className="inline-flex h-11 items-center rounded-xl bg-lime px-5 font-display font-bold text-[#0b0d10] transition hover:bg-lime-hover"
                >
                  Start chatting
                </Link>
                {plus.status !== 'admin' && plus.status !== 'pass' && (
                  <button
                    onClick={manage}
                    disabled={busy === 'portal'}
                    className="h-11 rounded-xl border border-line-2 px-4 text-sm font-semibold text-[#e6e8ec] transition hover:border-mute disabled:opacity-50"
                  >
                    {busy === 'portal' ? 'Opening…' : 'Manage or cancel subscription'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div role="radiogroup" aria-label="Choose a plan" className="grid grid-cols-3 gap-2">
                {shown.map((p) => {
                  const info = PLAN_INFO[p.plan];
                  const on = p.plan === picked;
                  return (
                    <button
                      key={p.plan}
                      role="radio"
                      aria-checked={on}
                      onClick={() => setPicked(p.plan)}
                      className={`flex min-h-[76px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-3 text-center transition ${
                        on ? 'border-2 border-gold bg-gold-bg' : 'border border-line-2 bg-card hover:border-mute'
                      }`}
                    >
                      <span className={`text-xs ${on ? 'text-gold' : 'text-mute'}`}>
                        {info.label}
                        {info.tag && <span className="max-[379px]:hidden"> · {info.tag.toLowerCase()}</span>}
                      </span>
                      <span className="max-w-full break-words font-display text-lg font-bold leading-tight sm:text-xl">{money(p.amount, p.currency)}</span>
                      <span className="text-[11px] text-dim">{perWeek(p)}/wk</span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => void subscribe(picked)}
                // Logged out: always clickable (it goes to log in / sign up first).
                disabled={(!!user && !enabled) || busy !== null}
                className="h-[58px] rounded-2xl bg-gold font-display text-lg font-bold text-gold-bg transition hover:brightness-110 disabled:opacity-50"
              >
                {busy === picked ? 'Opening checkout…' : user ? 'Continue' : 'Log in to subscribe'}
              </button>
              <p className="m-0 text-center text-xs text-dim">
                {PLAN_INFO[chosen.plan].name} · {billedText(chosen)}
              </p>
            </div>
          )}

          {upi && (!plus?.active || plus.status === 'pass' || plus.status === 'admin') && (
            <div className={card}>
              <h2 className="m-0 font-display text-base font-bold">Plus passes — pay with UPI</h2>
              <p className="m-0 mt-1 text-[13px] text-dim">
                One-time payment in rupees (UPI, cards, wallets). No auto-renew{plus?.active ? ' — adds to your current Plus' : ''}.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {PLUS_PASSES.map((p) => (
                  <button
                    key={p.plan}
                    disabled={busy !== null}
                    onClick={async () => {
                      if (!user || !token) return router.push('/signup?next=/plus');
                      setBusy(`upi:${p.plan}`);
                      setError(null);
                      try {
                        const done = await payWithRazorpay(`plus:${p.plan}`, token, { email: user.email }, `Plus for ${p.days} days`);
                        if (done === 'paid') {
                          await refresh();
                          setNotice(`👑 Plus is on for ${p.days} more days. Enjoy!`);
                        }
                      } catch (e) {
                        setError(errorText(e));
                      } finally {
                        setBusy(null);
                      }
                    }}
                    className="flex min-h-[64px] min-w-0 flex-col items-center justify-center rounded-2xl border border-line-2 bg-card-2 px-1.5 py-2.5 text-center transition hover:border-lime disabled:opacity-50"
                  >
                    <span className="text-xs text-mute">{p.days === 7 ? '1 week' : p.days === 30 ? '1 month' : '6 months'}</span>
                    <span className="font-display text-lg font-bold">{busy === `upi:${p.plan}` ? 'Opening…' : inr(p.paise)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!enabled && !plus?.active && <p className="m-0 text-center text-sm text-mute">Payments are being set up. Plus will be available soon.</p>}
          <p className="m-0 text-center text-[11px] leading-normal text-faint">
            Cancel anytime. Secure payment by Stripe. Prices shown before tax. Subscriptions renew automatically until canceled; cancel any time in
            Settings → Manage subscription. See the{' '}
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
