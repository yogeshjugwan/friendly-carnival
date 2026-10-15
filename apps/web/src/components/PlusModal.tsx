'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PlanPrice, PlusPlan } from '@rc/shared';
import { api, useAuth } from '@/lib/auth';
import { errorText } from './forms/fields';

/** Plan names and tags as the design shows them; prices come from Stripe. */
const PLANS: { plan: PlusPlan; name: string; tag: string; per: string }[] = [
  { plan: 'week', name: 'Weekly', tag: '', per: 'wk' },
  { plan: 'month', name: 'Monthly', tag: 'Most popular', per: 'mo' },
  { plan: 'halfyear', name: '6 months', tag: 'Best value', per: '6 mo' },
];
const PERKS = ['Choose gender and country', 'See who is online right now', 'Plus badge on your profile'];

const money = (p: PlanPrice | undefined) =>
  p ? new Intl.NumberFormat(undefined, { style: 'currency', currency: p.currency.toUpperCase() }).format(p.amount / 100) : '—';

const Check = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="#ff6fae" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12l5 5 9-10" />
  </svg>
);

/**
 * "Get randomCall Plus": a centred two-panel modal on larger screens, a bottom
 * sheet on phones. Pick a plan → Stripe Checkout (logged out → log in first).
 */
export function PlusModal({ onClose }: { onClose: () => void }) {
  const { user, token } = useAuth();
  const [prices, setPrices] = useState<PlanPrice[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [sel, setSel] = useState<PlusPlan>('month');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Logged out: "Log in to get Plus" step (Plus is tied to an account).
  const [step, setStep] = useState<'plans' | 'login'>('plans');

  useEffect(() => {
    api<{ enabled: boolean; plans: PlanPrice[] }>('/billing/plans')
      .then((r) => {
        setEnabled(r.enabled);
        setPrices(r.plans);
      })
      .catch(() => setEnabled(false));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const chosen = PLANS.find((p) => p.plan === sel)!;
  const go = async () => {
    if (!user || !token) return setStep('login');
    setBusy(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>('/billing/checkout', { plan: sel }, token);
      window.location.href = url;
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] font-sans text-[#f4f5f7]">
      <div aria-hidden className="absolute inset-0 bg-[rgba(11,8,17,.78)] backdrop-blur-md" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Get randomCall Plus"
        className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-[26px] border-t border-line-2 bg-card text-left sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[760px] sm:max-w-[calc(100%-32px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:flex-row sm:flex-wrap sm:rounded-[28px] sm:border sm:shadow-[0_40px_120px_rgba(0,0,0,.7)]"
      >
        <div className="relative flex flex-col gap-3 bg-[radial-gradient(circle_at_0%_0%,#3a2e08_0%,#16130a_75%)] px-5 pb-[18px] pt-2.5 sm:flex-[1_1_300px] sm:gap-[18px] sm:p-8">
          <span aria-hidden className="h-1 w-10 self-center rounded-sm bg-[#6b5d84] sm:hidden" />
          <span className="flex h-7 items-center gap-1.5 self-start rounded-full border border-[#4a3f17] bg-[rgba(242,201,76,.12)] px-2.5 text-xs font-semibold text-gold sm:h-[30px] sm:px-3 sm:text-[13px]">
            randomCall Plus
          </span>
          <h2 className="m-0 font-display text-[30px] font-bold leading-[1.05] tracking-[-.5px] sm:text-[40px] sm:leading-[1.02] sm:tracking-[-1px]">
            Meet who <span className="text-gold">you want.</span>
          </h2>
          <ul className="m-0 grid list-none grid-cols-1 gap-x-2.5 gap-y-2 p-0 text-[13px] sm:flex sm:flex-col sm:gap-3 sm:text-[15px]">
            {PERKS.map((p) => (
              <li key={p} className="flex items-center gap-1.5 sm:gap-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[rgba(255,111,174,.12)]">
                  <Check />
                </span>
                {p}
              </li>
            ))}
          </ul>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute right-3.5 top-3.5 grid h-11 w-11 place-items-center rounded-full bg-black/35 text-[#e6e8ec] sm:hidden"
          >
            ✕
          </button>
        </div>

        <div className="relative flex flex-col gap-2 px-5 pb-6 pt-4 sm:flex-[1_1_320px] sm:gap-2.5 sm:p-6">
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute right-3.5 top-3.5 grid h-11 w-11 place-items-center rounded-full bg-[#271f33] text-[#e6e8ec] max-sm:hidden"
          >
            ✕
          </button>
          {step === 'login' ? (
            <>
              <button
                type="button"
                onClick={() => setStep('plans')}
                className="flex h-11 items-center gap-1 self-start px-1.5 text-sm font-semibold text-mute"
              >
                <span aria-hidden>‹</span> Back
              </button>
              <h3 className="m-0 font-display text-xl font-bold">Log in to get Plus</h3>
              <p className="m-0 text-sm leading-normal text-[#c9cdd4]">
                Plus is tied to your account so it works on every device. Your <b className="text-gold">{chosen.name}</b> plan stays selected.
              </p>
              <Link href="/login?next=/plus" className="flex h-[54px] items-center justify-center rounded-2xl bg-gold font-display text-[17px] font-bold text-[#1a1404]">
                Log in
              </Link>
              <Link
                href="/signup?next=/plus"
                className="flex h-[52px] items-center justify-center rounded-[14px] border-[1.5px] border-[#6b5d84] text-[15px] font-semibold text-[#e6e8ec]"
              >
                Create a free account
              </Link>
            </>
          ) : (
            <>
              <h3 className="m-0 mb-1 mt-2 font-display text-lg font-bold max-sm:hidden">Choose a plan</h3>
              <div role="radiogroup" aria-label="Plan" className="flex flex-col gap-2">
                {PLANS.map((p) => {
                  const on = p.plan === sel;
                  return (
                    <button
                      key={p.plan}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setSel(p.plan)}
                      className={`flex min-h-14 items-center justify-between rounded-[14px] border-2 px-3.5 text-left sm:min-h-[62px] sm:px-4 ${on ? 'border-gold bg-[#1f1a08]' : 'border-divider bg-card-2'}`}
                    >
                      <span className="flex flex-col items-start gap-0.5">
                        <strong className="font-display text-[15px] sm:text-base">{p.name}</strong>
                        <span className="min-h-[14px] text-[11px] text-gold sm:text-xs">{p.tag}</span>
                      </span>
                      <span className="text-[15px] font-semibold sm:text-base">
                        {money(prices.find((x) => x.plan === p.plan))} / {p.per}
                      </span>
                    </button>
                  );
                })}
              </div>
              {error && <p role="alert" className="m-0 text-sm text-stop-text">{error}</p>}
              <button
                type="button"
                onClick={() => void go()}
                disabled={busy || (!!user && !enabled)}
                className="mt-1 h-[54px] rounded-2xl bg-gold font-display text-[17px] font-bold text-[#1a1404] disabled:opacity-50"
              >
                {busy ? 'Opening checkout…' : enabled ? `Continue with ${chosen.name}` : 'Payments coming soon'}
              </button>
              <p className="m-0 text-center text-[11px] text-mute sm:text-xs">Cancel anytime · Secure payment by Stripe</p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
