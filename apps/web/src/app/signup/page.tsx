'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MIN_AGE, MIN_PASSWORD_LENGTH } from '@rc/shared';
import { AuthCard } from '@/components/SiteHeader';
import { errorText, Field, FormError, Submit } from '@/components/forms/fields';
import { Agreement, GoogleSignIn } from '@/components/forms/social';
import { useAuth } from '@/lib/auth';
import { pendingInviteCode } from '@/lib/referral';

/** Only same-site paths, so ?next= can't send people to another website. */
const safeNext = () => {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
};

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terms, setTerms] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const [next, setNext] = useState<string | null>(null);

  const [invited, setInvited] = useState(false);
  useEffect(() => {
    setNext(safeNext());
    setInvited(!!pendingInviteCode());
  }, []);

  return (
    <AuthCard title="Create an account">
      <p className="mt-1 text-sm text-slate-500">Optional — save your settings and keep them on every device.</p>
      {invited && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          🎁 A friend invited you! Sign up, confirm your email and have your first chat — you both get a free day of 👑 Plus.
        </p>
      )}
      <GoogleSignIn
        agreed={adult && terms}
        next={next ?? '/settings?welcome=1'}
        onNeedAgreement={() => setHighlight(true)}
      />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!adult || !terms) {
            setHighlight(true);
            return setError('Please tick both boxes to create your account.');
          }
          setBusy(true);
          setError(null);
          try {
            await signup(email, password, birthDate);
            router.push(safeNext() ?? '/settings?welcome=1');
          } catch (err) {
            setError(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field id="email" label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          id="password"
          label={`Password (at least ${MIN_PASSWORD_LENGTH} characters)`}
          type="password"
          autoComplete="new-password"
          required
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
        <Agreement adult={adult} terms={terms} onAdult={setAdult} onTerms={setTerms} highlight={highlight} />
        <FormError error={error} />
        <Submit busy={busy}>Sign up</Submit>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-brand">
          Log in
        </Link>
      </p>
      <p className="mt-4 border-t border-slate-200 pt-4 text-center text-sm">
        <Link href="/" className="font-medium text-slate-600 hover:text-ink">
          Continue as guest →
        </Link>
        <span className="block text-xs text-slate-400">No account needed to chat.</span>
      </p>
    </AuthCard>
  );
}
