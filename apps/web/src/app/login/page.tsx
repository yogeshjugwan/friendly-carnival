'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MIN_AGE, MIN_PASSWORD_LENGTH } from '@rc/shared';
import { AuthCard } from '@/components/SiteHeader';
import { errorText, Field, FormError, Submit } from '@/components/forms/fields';
import { Agreement, GoogleSignIn, googleError } from '@/components/forms/social';
import { api, useAuth } from '@/lib/auth';
import { pendingInviteCode } from '@/lib/referral';

/** Only same-site paths, so ?next= can't send people to another website. */
const safeNext = () => {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
};

/**
 * One box for logging in and signing up (also served at /signup): enter your
 * email; if it has an account you get the password box, otherwise the
 * new-account fields (password, date of birth, the 18+ / terms boxes).
 */
export default function LoginPage() {
  const { login, signup } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'login' | 'signup'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const [next, setNext] = useState<string | null>(null);
  const [invited, setInvited] = useState(false);

  useEffect(() => {
    setNext(safeNext());
    setInvited(!!pendingInviteCode());
    setError(googleError(new URLSearchParams(window.location.search).get('error')));
  }, []);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const changeEmail = () => {
    setStep('email');
    setPassword('');
    setError(null);
  };

  const title = step === 'login' ? 'Welcome back' : step === 'signup' ? 'Create your account' : 'Log in or sign up';
  const hint =
    step === 'email'
      ? 'Optional — keep your settings, friends and coins on every device.'
      : step === 'login'
        ? 'Enter your password to log in.'
        : 'No account with this email yet — set one up in a few seconds.';

  return (
    <AuthCard title={title}>
      <p className="mt-1 text-sm text-dim">{hint}</p>
      {invited && step !== 'login' && (
        <p className="mt-3 rounded-xl bg-gold-bg p-3 text-sm text-gold">
          🎁 A friend invited you! Sign up, confirm your email and have your first chat — you both get a free day of 👑 Plus.
        </p>
      )}

      {step === 'email' && <GoogleSignIn agreed={adult && terms} next={next} onNeedAgreement={() => setHighlight(true)} />}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (step === 'email') {
            void run(async () => {
              const { exists } = await api<{ exists: boolean }>('/auth/check', { email: email.trim() });
              setStep(exists ? 'login' : 'signup');
            });
          } else if (step === 'login') {
            void run(async () => {
              await login(email.trim(), password);
              router.push(safeNext() ?? '/');
            });
          } else {
            if (!adult || !terms) {
              setHighlight(true);
              setError('Please tick both boxes to create your account.');
              return;
            }
            void run(async () => {
              await signup(email.trim(), password, birthDate);
              router.push(safeNext() ?? '/settings?welcome=1');
            });
          }
        }}
      >
        {step === 'email' ? (
          <Field id="email" label="Email" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        ) : (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-card-2 px-3.5 py-3 text-sm">
            <span className="min-w-0 truncate text-[#f4f5f7]">{email}</span>
            <button type="button" onClick={changeEmail} className="shrink-0 font-medium text-lime hover:underline">
              Change
            </button>
          </div>
        )}

        {step === 'login' && (
          <Field
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}

        {step === 'signup' && (
          <>
            <Field
              id="password"
              label={`Choose a password (at least ${MIN_PASSWORD_LENGTH} characters)`}
              type="password"
              autoComplete="new-password"
              required
              autoFocus
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Field
              id="birthDate"
              label={`Date of birth (you must be ${MIN_AGE}+)`}
              type="date"
              autoComplete="bday"
              required
              max={new Date().toISOString().slice(0, 10)}
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </>
        )}

        {/* Google can create an account, so it needs the boxes too; email log-ins agreed when they signed up. */}
        {step !== 'login' && <Agreement adult={adult} terms={terms} onAdult={setAdult} onTerms={setTerms} highlight={highlight} />}
        <FormError error={error} />
        <Submit busy={busy}>{step === 'email' ? 'Continue' : step === 'login' ? 'Log in' : 'Create account'}</Submit>
      </form>

      {step === 'login' && (
        <p className="mt-4 text-center text-sm">
          <Link href="/forgot" className="text-lime hover:underline">
            Forgot password?
          </Link>
        </p>
      )}
      <p className="mt-5 border-t border-line pt-4 text-center text-sm">
        <Link href="/" className="font-medium text-mute hover:text-white">
          Continue as guest →
        </Link>
        <span className="block text-xs text-dim">No account needed to chat.</span>
      </p>
    </AuthCard>
  );
}
