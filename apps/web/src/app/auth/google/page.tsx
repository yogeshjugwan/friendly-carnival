'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AuthCard } from '@/components/SiteHeader';
import { errorText } from '@/components/forms/fields';
import { useAuth } from '@/lib/auth';

/** Google sign-in lands here with the session token in the URL fragment. */
export default function GoogleCallbackPage() {
  const { adoptSession } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    // Drop the token from the address bar and history straight away.
    window.history.replaceState(null, '', window.location.pathname);
    const token = params.get('token');
    const next = params.get('next') ?? '/';
    if (!token) return void router.replace('/login?error=google_failed');
    adoptSession(token, params.get('new') === '1')
      .then(() => router.replace(next.startsWith('/') && !next.startsWith('//') ? next : '/'))
      .catch((e) => setError(errorText(e)));
  }, [adoptSession, router]);

  return (
    <AuthCard title="Signing you in…">
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : <p className="mt-3 text-sm text-slate-500">One moment.</p>}
    </AuthCard>
  );
}
