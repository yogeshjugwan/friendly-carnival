'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MIN_AGE, MIN_PASSWORD_LENGTH } from '@rc/shared';
import { AuthSplit } from '@/components/AuthSplit';
import { errorText } from '@/components/forms/fields';
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
  'h-12 w-full rounded-xl border border-[#6b5d84] bg-card px-3.5 text-[15px] text-[#f4f5f7] [color-scheme:dark] placeholder:text-faint focus:outline-2 focus:outline-offset-1 focus:outline-lime aria-[invalid=true]:border-stop-text';
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
  // Google sign-up: "One more step" asks for age + terms first (Google doesn't share age).
  const [gStep, setGStep] = useState(false);
  const [gAge, setGAge] = useState('');
  const [gAgree, setGAgree] = useState(false);
  const [gErr, setGErr] = useState<string | null>(null);
  const [done, setDone] = useState<null | 'login' | 'signup'>(null);

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
        const n = safeNext();
        if (n) router.push(n);
        else setDone('login');
      } else {
        await signup(email.trim(), password, birthDate);
        const n = safeNext();
        if (n) router.push(n);
        else setDone('signup');
      }
    } catch (err) {
      const msg = errorText(err);
      // Typed into the wrong tab: point them to the other one.
      setError(
        tab === 'signup' && /already exists/i.test(msg)
          ? 'You already have an account — log in instead.'
          : tab === 'login' && /invalid|incorrect|wrong/i.test(msg)
            ? 'Wrong email or password. Try again or tap “Forgot?”.'
            : msg,
      );
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
    `h-11 flex-1 rounded-[10px] text-sm font-semibold transition ${on ? 'bg-pick text-[#f4f5f7] shadow-[inset_0_0_0_1.5px_#ff6fae]' : 'text-mute hover:text-[#f4f5f7]'}`;

  const googleHref = `${API_URL}/auth/google/start?next=${encodeURIComponent(next ?? '/')}`;
  const goGoogle = () => {
    setGoing(true);
    markGoogleStart();
    window.location.href = googleHref;
  };
  const gContinue = () => {
    const n = Number(gAge);
    if (!Number.isInteger(n) || n < MIN_AGE || n > 99) return setGErr(gAge && n < MIN_AGE ? `You must be ${MIN_AGE} or older to use randomCall.` : `Enter your age (${MIN_AGE}+).`);
    if (!gAgree) return setGErr('Tick “I’m 18+ and agree” to continue.');
    setGErr(null);
    setGStep(false);
    setAgreed(true);
    goGoogle();
  };

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

        {/* Google sign-up asks for age + terms first ("One more step"); log in goes straight through. */}
        <button
          type="button"
          aria-disabled={going}
          onClick={() => {
            if (going) return;
            if (!google) return setError('Google sign-in is not available right now — use your email below.');
            if (tab === 'signup' && !agreed) {
              setGErr(null);
              return setGStep(true);
            }
            goGoogle();
          }}
          className={`flex h-[50px] w-full items-center justify-center gap-2.5 rounded-xl bg-white text-[15px] font-semibold text-[#1a1a1a] transition hover:bg-[#f1f1f1] ${going ? 'pointer-events-none opacity-70' : ''}`}
        >
          {going ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" aria-hidden /> : <GoogleLogo />}
          {going ? 'Connecting to Google…' : 'Continue with Google'}
        </button>

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
                <Link href="/forgot" className="-my-3.5 inline-block px-0.5 py-3.5 text-xs text-lime hover:text-lime-hover">
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
                className={`${input} !bg-night`}
              />
            </label>
          )}

          {tab === 'signup' && (
          <label
            className={`flex min-h-11 items-center gap-2.5 rounded-xl text-[13px] leading-[1.4] text-mute transition ${highlight && !agreed ? 'bg-stop p-3 ring-2 ring-stop-text' : ''}`}
          >
            <input
              id="agree"
              type="checkbox"
              checked={agreed}
              onChange={(e) => {
                setAgreed(e.target.checked);
                if (e.target.checked) setError(null);
              }}
              aria-invalid={highlight && !agreed}
              className="h-[22px] w-[22px] shrink-0 accent-lime"
            />
            <span>
              I&apos;m 18+ and agree to the{' '}
              <Link href="/terms" className="-my-3.5 inline-block px-0.5 py-3.5 text-lime hover:text-lime-hover">
                Terms
              </Link>{' '}
              &amp;{' '}
              <Link href="/privacy" className="-my-3.5 inline-block px-0.5 py-3.5 text-lime hover:text-lime-hover">
                Privacy
              </Link>
            </span>
          </label>
          )}
          {tab === 'signup' && <p className="m-0 text-xs text-[#8a8f99]">Your name comes from Home (or “Stranger” until you add one in Settings).</p>}

          {error && (
            <p role="alert" className="m-0 rounded-xl border border-[#4a2424] bg-[#2a1616] px-3 py-2.5 text-[13px] text-[#ffb3ac]">
              {error}
            </p>
          )}

          <div className="mt-auto flex flex-col gap-3 lg:mt-0">
            <button
              type="submit"
              disabled={busy}
              className="h-[54px] rounded-[14px] bg-lime font-display text-[17px] font-bold text-night transition hover:bg-lime-hover disabled:opacity-50"
            >
              {busy ? 'Please wait…' : tab === 'login' ? 'Log in' : 'Sign up'}
            </button>
            <Link href="/" className="flex h-11 items-center justify-center text-sm text-mute transition hover:text-[#f4f5f7]">
              Continue as guest →
            </Link>
          </div>
        </form>
      </div>

      {gStep && (
        <div className="fixed inset-0 z-[60]">
          <div aria-hidden className="absolute inset-0 bg-[rgba(11,8,17,.78)]" onClick={() => setGStep(false)} />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="One more step"
            className="absolute inset-x-0 bottom-0 flex flex-col gap-3 rounded-t-3xl border border-divider bg-card px-5 pb-6 pt-2.5 sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[420px] sm:max-w-[calc(100%-32px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[22px] sm:p-6 sm:shadow-[0_30px_80px_rgba(0,0,0,.6)]"
          >
            <span aria-hidden className="h-1 w-10 self-center rounded-sm bg-line-2 sm:hidden" />
            <h2 className="m-0 font-display text-[22px] font-bold">One more step</h2>
            <p className="m-0 text-sm text-[#c9cdd4]">randomCall is for adults only. Google doesn’t share your age with us.</p>
            <label className={lbl}>
              Your age
              <input
                type="number"
                min={MIN_AGE}
                max={99}
                placeholder="18+"
                inputMode="numeric"
                autoFocus
                value={gAge}
                onChange={(e) => setGAge(e.target.value.slice(0, 2))}
                className={`${input} !bg-night`}
              />
            </label>
            <label className="flex min-h-11 items-center gap-2.5 text-[13px] text-mute">
              <input type="checkbox" checked={gAgree} onChange={(e) => setGAgree(e.target.checked)} className="h-[22px] w-[22px] shrink-0 accent-lime" />
              <span>
                I’m 18+ and agree to the{' '}
                <Link href="/terms" className="-my-3.5 inline-block px-0.5 py-3.5 text-lime">
                  Terms
                </Link>
              </span>
            </label>
            {gErr && (
              <p role="alert" className="m-0 rounded-xl border border-[#4a2424] bg-[#2a1616] px-3 py-2.5 text-[13px] text-[#ffb3ac]">
                {gErr}
              </p>
            )}
            <button type="button" onClick={gContinue} className="h-[52px] w-full rounded-[14px] bg-lime font-display text-base font-bold text-night">
              Continue
            </button>
            <button type="button" onClick={() => setGStep(false)} className="h-[52px] w-full rounded-[14px] border-[1.5px] border-[#6b5d84] text-[15px] font-semibold text-[#e6e8ec]">
              Cancel
            </button>
          </section>
        </div>
      )}

      {done && (
        <section role="status" aria-live="polite" className="fixed inset-0 z-[60] flex items-center justify-center bg-night p-6">
          <div className="flex w-full max-w-[420px] flex-col gap-3.5 text-center">
            <span aria-hidden className="grid h-16 w-16 place-items-center self-center rounded-full bg-pick text-lime">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5 9-10" />
              </svg>
            </span>
            <h1 className="m-0 font-display text-[28px] font-bold">{done === 'signup' ? 'Account created' : 'You’re logged in'}</h1>
            <p className="m-0 text-[15px] leading-normal text-[#c9cdd4]">Your name, coins, follows and messages are synced. Next time you won’t need to fill anything in.</p>
            <Link href="/" className="flex h-[52px] items-center justify-center rounded-[14px] bg-lime font-display text-base font-bold text-night">
              Start chatting
            </Link>
            <Link href="/" className="flex h-[52px] items-center justify-center rounded-[14px] border-[1.5px] border-[#6b5d84] text-[15px] font-semibold text-[#e6e8ec]">
              Go to Home
            </Link>
          </div>
        </section>
      )}
    </AuthSplit>
  );
}
