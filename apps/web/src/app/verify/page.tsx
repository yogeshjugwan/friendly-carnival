'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AuthCard } from '@/components/SiteHeader';
import { errorText, FormError, FormNote, tokenFromUrl } from '@/components/forms/fields';
import { api, useAuth } from '@/lib/auth';

export default function VerifyPage() {
  const { refresh } = useAuth();
  const [state, setState] = useState<'working' | 'done' | 'error'>('working');
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // the token is single-use; don't send it twice in dev Strict Mode
    started.current = true;
    const token = tokenFromUrl();
    if (!token) {
      setState('error');
      setError('This link is missing its token.');
      return;
    }
    api('/auth/verify', { token })
      .then(() => {
        setState('done');
        void refresh().catch(() => undefined);
      })
      .catch((e) => {
        setState('error');
        setError(errorText(e));
      });
  }, [refresh]);

  return (
    <AuthCard title="Confirm your email">
      {state === 'working' && <p className="mt-3 text-slate-600">Confirming…</p>}
      {state === 'done' && (
        <FormNote>
          Your email is confirmed.{' '}
          <Link href="/" className="font-medium underline">
            Start chatting
          </Link>
        </FormNote>
      )}
      <FormError error={state === 'error' ? error : null} />
    </AuthCard>
  );
}
