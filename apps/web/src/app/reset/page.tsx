'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MIN_PASSWORD_LENGTH } from '@rc/shared';
import { AuthCard } from '@/components/SiteHeader';
import { errorText, Field, FormError, FormNote, Submit, tokenFromUrl } from '@/components/forms/fields';
import { api, useAuth } from '@/lib/auth';

export default function ResetPage() {
  const { forget } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setToken(tokenFromUrl()), []);

  return (
    <AuthCard title="Choose a new password">
      {done ? (
        <FormNote>
          Password changed. You were signed out on all devices.{' '}
          <Link href="/login" className="font-medium underline">
            Log in
          </Link>
        </FormNote>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!token) return setError('This link is missing its token. Request a new one.');
            setBusy(true);
            setError(null);
            try {
              await api('/auth/reset', { token, password });
              forget();
              setDone(true);
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field
            id="password"
            label={`New password (at least ${MIN_PASSWORD_LENGTH} characters)`}
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FormError error={error} />
          <Submit busy={busy}>Save password</Submit>
        </form>
      )}
    </AuthCard>
  );
}
