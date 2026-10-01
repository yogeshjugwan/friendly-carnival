'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MIN_PASSWORD_LENGTH } from '@rc/shared';
import { AuthCard } from '@/components/SiteHeader';
import { errorText, Field, FormError, Submit } from '@/components/forms/fields';
import { useAuth } from '@/lib/auth';

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AuthCard title="Create an account">
      <p className="mt-1 text-sm text-slate-500">Optional — save your settings and keep them on every device.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!adult) return setError('You must be 18 or older to use randomCall.');
          setBusy(true);
          setError(null);
          try {
            await signup(email, password);
            router.push('/settings?welcome=1');
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
        <label className="mt-4 flex items-start gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>
            I am 18 or older and agree to the{' '}
            <Link href="/terms" className="text-brand underline">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-brand underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
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
