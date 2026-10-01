'use client';

import { useState } from 'react';
import { AuthCard } from '@/components/SiteHeader';
import { errorText, Field, FormError, FormNote, Submit } from '@/components/forms/fields';
import { api } from '@/lib/auth';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AuthCard title="Reset your password">
      {sent ? (
        <FormNote>If an account exists for {email}, we sent a reset link. It expires in 1 hour.</FormNote>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await api('/auth/forgot', { email });
              setSent(true);
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field id="email" label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <FormError error={error} />
          <Submit busy={busy}>Send reset link</Submit>
        </form>
      )}
    </AuthCard>
  );
}
