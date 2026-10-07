'use client';

import Link from 'next/link';
import { useState } from 'react';
import { MIN_AGE } from '@rc/shared';
import { api, useAuth } from '@/lib/auth';
import { errorText } from './forms/fields';

/**
 * Accounts made without a birth date (Google sign-in, older accounts) give it
 * once before chatting. Mounted in the layout.
 */
export function AgeGate() {
  const { user, token, refresh } = useAuth();
  const [birthDate, setBirthDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user || !token || user.birthDateSet) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="age-title">
      <form
        className="w-full max-w-sm rounded-2xl bg-white p-6 text-ink shadow-2xl"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api('/auth/birthdate', { birthDate }, token);
            await refresh();
          } catch (err) {
            setError(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 id="age-title" className="text-xl font-semibold">
          One quick thing
        </h2>
        <p className="mt-1 text-sm text-slate-600">randomCall is for adults ({MIN_AGE}+). Please enter your date of birth — you only do this once.</p>
        <label htmlFor="age-dob" className="mt-4 block text-sm font-medium">
          Date of birth
        </label>
        <input
          id="age-dob"
          type="date"
          required
          max={new Date().toISOString().slice(0, 10)}
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button disabled={busy || !birthDate} className="mt-4 w-full rounded-lg bg-brand py-2.5 font-semibold text-white disabled:opacity-50">
          {busy ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}

/** Why this account can't chat right now (shown on the home page). */
export function AgeHoldNotice() {
  const { user } = useAuth();
  if (!user?.ageHold) return null;
  return user.ageHold === 'under-18' ? (
    <p className="rounded-xl bg-red-500/15 p-4 text-center text-sm text-red-100">
      randomCall is only for people aged {MIN_AGE} and over, so chatting is turned off for this account.
    </p>
  ) : (
    <p className="rounded-xl bg-amber-500/15 p-4 text-center text-sm text-amber-100">
      Someone reported that you may be under {MIN_AGE}. To keep chatting, confirm it&apos;s you with a quick selfie.{' '}
      <Link href="/get-verified" className="font-semibold underline">
        Get verified
      </Link>
    </p>
  );
}
