'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { errorText } from '@/components/forms/fields';
import { api } from '@/lib/auth';

/** Landing page for the "Unsubscribe" link in activity emails. */
export default function UnsubscribePage() {
  const [state, setState] = useState<'working' | 'done' | string>('working');
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    api('/auth/unsubscribe', { u: q.get('u'), t: q.get('t') })
      .then(() => setState('done'))
      .catch((e) => setState(errorText(e)));
  }, []);
  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <SiteHeader />
      <section className="mt-10 rounded-2xl bg-white p-6 text-center text-ink">
        {state === 'working' ? (
          <p>Unsubscribing…</p>
        ) : state === 'done' ? (
          <>
            <p className="text-lg font-semibold">You&apos;re unsubscribed.</p>
            <p className="mt-1 text-sm text-slate-500">
              We won&apos;t send you activity emails any more. Account emails (like password resets) still arrive. You can turn them back on
              in{' '}
              <Link href="/settings" className="text-brand underline">
                Settings
              </Link>
              .
            </p>
          </>
        ) : (
          <p className="text-red-600">{state}</p>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
