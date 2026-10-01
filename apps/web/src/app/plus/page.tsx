'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PlanPrice, PlusPlan } from '@rc/shared';
import { PLUS_FEATURES } from '@/components/PlusUpsell';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { errorText, FormError, FormNote } from '@/components/forms/fields';
import { api, useAuth } from '@/lib/auth';

const PLAN_INFO: Record<PlusPlan, { name: string; tag?: string; fallback: PlanPrice }> = {
  week: { name: '1 week', fallback: { plan: 'week', amount: 799, currency: 'usd', interval: 'week', intervalCount: 1 } },
  month: { name: '1 month', tag: 'Popular', fallback: { plan: 'month', amount: 1999, currency: 'usd', interval: 'month', intervalCount: 1 } },
  halfyear: { name: '6 months', tag: 'Best value', fallback: { plan: 'halfyear', amount: 8999, currency: 'usd', interval: 'month', intervalCount: 6 } },
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
  const [busy, setBusy] = useState<PlusPlan | 'portal' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);

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

  return (
    <main className="mx-auto flex min-h-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <SiteHeader />
      <section className="mt-4 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-400">randomCall Plus</p>
        <h1 className="mt-2 text-4xl font-bold">Choose who you meet</h1>
        <p className="mt-3 text-slate-300">Filters, no ads, and a Plus badge. Cancel any time.</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PLUS_FEATURES.map((f) => (
          <div key={f.title} className="rounded-xl bg-panel p-4">
            <p className="text-2xl" aria-hidden>
              {f.icon}
            </p>
            <p className="mt-2 font-semibold">{f.title}</p>
            <p className="text-sm text-slate-400">{f.body}</p>
          </div>
        ))}
      </section>

      {notice && <FormNote>{notice}</FormNote>}
      {waiting && <p className="text-center text-slate-300">Activating your Plus membership…</p>}
      <FormError error={error} />

      {plus?.active ? (
        <section className="rounded-2xl bg-white p-6 text-ink">
          <h2 className="text-xl font-semibold">👑 You have Plus</h2>
          <p className="mt-2 text-slate-600">
            {plus.status === 'admin'
              ? `Complimentary Plus until ${new Date(plus.until!).toLocaleDateString()}.`
              : plus.cancelAtPeriodEnd
                ? `Your plan ends on ${new Date(plus.until!).toLocaleDateString()} and will not renew.`
                : `Your ${plus.plan ? PLAN_INFO[plus.plan].name : ''} plan renews on ${new Date(plus.until!).toLocaleDateString()}.`}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/" className="rounded-lg bg-brand px-4 py-2 font-semibold text-white">
              Start chatting
            </Link>
            {plus.status !== 'admin' && (
              <button onClick={manage} disabled={busy === 'portal'} className="rounded-lg bg-slate-200 px-4 py-2 font-semibold disabled:opacity-50">
                {busy === 'portal' ? 'Opening…' : 'Manage or cancel subscription'}
              </button>
            )}
          </div>
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-3">
          {shown.map((p) => {
            const info = PLAN_INFO[p.plan];
            const featured = p.plan === 'month';
            return (
              <div key={p.plan} className={`relative rounded-2xl bg-white p-6 text-ink ${featured ? 'ring-4 ring-amber-400' : ''}`}>
                {info.tag && (
                  <span className="absolute -top-3 left-6 rounded-full bg-amber-500 px-3 py-0.5 text-xs font-semibold text-white">{info.tag}</span>
                )}
                <p className="text-lg font-semibold">{info.name}</p>
                <p className="mt-2 text-3xl font-bold">
                  {perWeek(p)}
                  <span className="text-base font-normal text-slate-500">/week</span>
                </p>
                <p className="mt-1 text-sm text-slate-500">{billedText(p)}</p>
                <button
                  onClick={() => void subscribe(p.plan)}
                  disabled={!enabled || busy !== null}
                  className={`mt-5 w-full rounded-lg py-2.5 font-semibold disabled:opacity-50 ${featured ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-slate-900 text-white hover:bg-slate-700'}`}
                >
                  {busy === p.plan ? 'Opening checkout…' : user ? 'Continue' : 'Sign up to subscribe'}
                </button>
              </div>
            );
          })}
        </section>
      )}

      {!enabled && !plus?.active && (
        <p className="text-center text-sm text-slate-400">Payments are being set up. Plus will be available soon.</p>
      )}
      <p className="text-center text-xs text-slate-500">
        Secure payment by Stripe. Prices shown before tax. Subscriptions renew automatically until canceled; cancel any time in
        Settings → Manage subscription. See the{' '}
        <Link href="/terms" className="underline">
          Terms
        </Link>
        .
      </p>
      <SiteFooter />
    </main>
  );
}
