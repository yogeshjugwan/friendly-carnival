'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MIN_AGE, MIN_PASSWORD_LENGTH } from '@rc/shared';
import { AuthSplit } from '@/components/AuthSplit';
import { errorText, FormError } from '@/components/forms/fields';
import { GoogleLogo, googleError, useGoogleEnabled } from '@/components/forms/social';
import { API_URL, useAuth } from '@/lib/auth';
import { markGoogleStart } from '@/lib/googleReturn';
import { pendingInviteCode } from '@/lib/referral';

/** Only same-site paths, so ?next= can't send people to another website. */
const safeNext = () => {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
};

const input =
  'h-12 w-full rounded-xl border border-line-2 bg-card px-3.5 text-[15px] text-[#f4f5f7] [color-scheme:dark] placeholder:text-faint focus:outline-2 focus:outline-offset-1 focus:outline-lime lg:bg-card-2';
const lbl = 'flex flex-col gap-1.5 text-[13px] text-mute';

/**
 * Log in / Sign up (also served at /signup), as in the "Instant entry" design:
 * tabs, Continue with Google, email + password, one 18+ / terms box, then the guest way out.
 */
export default function LoginPage() {
  const { login, signup } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const google = useGoogleEnabled();
  const [tab, setTab] = useState<'login' | 'signup'>(path === '/signup' ? 'signup' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const [busy, setBusy] = useState(false);
  const [going, setGoing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [invited, setInvited] = useState(false);

  useEffect(() => {
    setNext(safeNext());
    setInvited(!!pendingInviteCode());
    setError(googleError(new URLSearchParams(window.location.search).get('error')));
    // Coming back with the browser's Back button: reset the Google button.
    const reset = () => setGoing(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  const needAgreement = () => {
    setHighlight(true);
    setError('Please tick the 18+ box first.');
    document.getElementById('agree')?.focus();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === 'signup' && !agreed) return needAgreement();
    setBusy(true);
    setError(null);
    try {
      if (tab === 'login') {
        await login(email.trim(), password);
        router.push(safeNext() ?? '/');
      } else {
        await signup(email.trim(), password, birthDate);
        router.push(safeNext() ?? '/settings?welcome=1');
      }
    } catch (err) {
      const msg = errorText(err);
      // Typed into the wrong tab: point them to the other one.
      setError(tab === 'signup' && /already exists/i.test(msg) ? 'You already have an account — log in instead.' : msg);
    } finally {
      setBusy(false);
    }
  };

  const switchTab = (t: 'login' | 'signup') => {
    setTab(t);
    setError(null);
    setHighlight(false);
  };

  const tabCls = (on: boolean) =>
    `h-10 flex-1 rounded-[10px] text-sm font-semibold transition ${on ? 'bg-[#1f232b] text-[#f4f5f7]' : 'text-mute hover:text-[#f4f5f7]'}`;

  return (
    <AuthSplit title={tab === 'login' ? 'Welcome' : 'Create your'} accent={tab === 'login' ? 'back.' : 'account.'}>
      <div className="mt-3 flex flex-1 flex-col gap-4">
        {invited && (
          <p className="m-0 rounded-xl bg-gold-bg p-3 text-sm text-gold">
            A friend invited you! Sign up, confirm your email and have your first chat — you both get a free day of Plus.
          </p>
        )}

        <div role="tablist" aria-label="Log in or sign up" className="flex rounded-[14px] border border-line bg-card p-1">
          <button type="button" role="tab" aria-selected={tab === 'login'} onClick={() => switchTab('login')} className={tabCls(tab === 'login')}>
            Log in
          </button>
          <button type="button" role="tab" aria-selected={tab === 'signup'} onClick={() => switchTab('signup')} className={tabCls(tab === 'signup')}>
            Sign up
          </button>
        </div>

        {/* Google can create an account, so it needs the 18+ box too. */}
        <a
          href={`${API_URL}/auth/google/start?next=${encodeURIComponent(next ?? '/')}`}
          aria-disabled={going}
          onClick={(e) => {
            if (!google) {
              e.preventDefault();
              setError('Google sign-in is not available right now — use your email below.');
              return;
            }
            if (!agreed) {
              e.preventDefault();
              return needAgreement();
            }
            setGoing(true);
            markGoogleStart();
          }}
          className={`flex h-[50px] items-center justify-center gap-2.5 rounded-xl bg-white text-[15px] font-semibold text-[#1a1a1a] transition hover:bg-[#f1f1f1] ${going ? 'pointer-events-none opacity-70' : ''}`}
        >
          {going ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" aria-hidden /> : <GoogleLogo />}
          {going ? 'Connecting to Google…' : 'Continue with Google'}
        </a>

        <div className="flex items-center gap-3 text-xs text-faint" aria-hidden>
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={submit} className="flex flex-1 flex-col gap-4">
          <label className={lbl} htmlFor="email">
            Email
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
          </label>
          <div className={lbl}>
            <span className="flex justify-between">
              <label htmlFor="password">{tab === 'signup' ? `Password (at least ${MIN_PASSWORD_LENGTH} characters)` : 'Password'}</label>
              {tab === 'login' && (
                <Link href="/forgot" className="text-xs text-lime hover:text-lime-hover">
                  Forgot?
                </Link>
              )}
            </span>
            <input
              id="password"
              type="password"
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={tab === 'signup' ? MIN_PASSWORD_LENGTH : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
            />
          </div>
          {tab === 'signup' && (
            <label className={lbl} htmlFor="birthDate">
              Date of birth (you must be {MIN_AGE}+)
              <input
                id="birthDate"
                type="date"
                autoComplete="bday"
                required
                max={new Date().toISOString().slice(0, 10)}
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className={input}
              />
            </label>
          )}

          <label
            className={`flex items-start gap-2.5 rounded-xl text-[13px] leading-[1.4] text-mute transition ${highlight && !agreed ? 'bg-stop p-3 ring-2 ring-stop-text' : ''}`}
          >
            <input
              id="agree"
              type="checkbox"
              checked={agreed}
              onChange={(e) => {
                setAgreed(e.target.checked);
                if (e.target.checked) setError(null);
              }}
              className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-lime"
            />
            <span>
              I&apos;m 18+ and agree to the{' '}
              <Link href="/terms" className="text-lime hover:text-lime-hover">
                Terms
              </Link>{' '}
              &amp;{' '}
              <Link href="/privacy" className="text-lime hover:text-lime-hover">
                Privacy Policy
              </Link>
            </span>
          </label>

          <FormError error={error} />

          <div className="mt-auto flex flex-col gap-3 lg:mt-0">
            <button
              type="submit"
              disabled={busy}
              className="h-[54px] rounded-[14px] bg-lime font-display text-[17px] font-bold text-night transition hover:bg-lime-hover disabled:opacity-50"
            >
              {busy ? 'Please wait…' : tab === 'login' ? 'Log in' : 'Sign up'}
            </button>
            <Link
              href="/"
              className="flex h-12 items-center justify-center rounded-[14px] border border-line-2 text-sm font-medium text-[#e6e8ec] transition hover:border-[#3a3f4a]"
            >
              Continue as guest →
            </Link>
          </div>
        </form>
      </div>
    </AuthSplit>
  );
}
