'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthCard } from '@/components/SiteHeader';
import { errorText, Field, FormError, Submit } from '@/components/forms/fields';
import { Agreement, GoogleSignIn, googleError } from '@/components/forms/social';
import { useAuth } from '@/lib/auth';

/** Only same-site paths, so ?next= can't send people to another website. */
const safeNext = () => {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
};

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const [next, setNext] = useState<string | null>(null);

  useEffect(() => {
    setNext(safeNext());
    setError(googleError(new URLSearchParams(window.location.search).get('error')));
  }, []);

  return (
    <AuthCard title="Log in">
      <GoogleSignIn
        agreed={adult && terms}
        next={next}
        onNeedAgreement={() => setHighlight(true)}
      />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await login(email, password);
            router.push(safeNext() ?? '/');
          } catch (err) {
            setError(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field id="email" label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field id="password" label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <FormError error={error} />
        <Submit busy={busy}>Log in</Submit>
      </form>
      <Agreement adult={adult} terms={terms} onAdult={setAdult} onTerms={setTerms} highlight={highlight} />
      <div className="mt-4 flex justify-between text-sm">
        <Link href="/forgot" className="text-brand">
          Forgot password?
        </Link>
        <Link href="/signup" className="font-medium text-brand">
          Create account
        </Link>
      </div>
      <p className="mt-4 border-t border-slate-200 pt-4 text-center text-sm">
        <Link href="/" className="font-medium text-slate-600 hover:text-ink">
          Continue as guest →
        </Link>
        <span className="block text-xs text-slate-400">No account needed to chat.</span>
      </p>
    </AuthCard>
  );
}
