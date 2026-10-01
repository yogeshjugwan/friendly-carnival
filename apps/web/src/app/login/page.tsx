'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthCard } from '@/components/SiteHeader';
import { errorText, Field, FormError, Submit } from '@/components/forms/fields';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AuthCard title="Log in">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await login(email, password);
            router.push('/');
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
      <div className="mt-4 flex justify-between text-sm">
        <Link href="/forgot" className="text-brand">
          Forgot password?
        </Link>
        <Link href="/signup" className="font-medium text-brand">
          Create account
        </Link>
      </div>
    </AuthCard>
  );
}
