'use client';

import Link from 'next/link';
import { useState } from 'react';
import { MIN_AGE } from '@rc/shared';
import { api, useAuth } from '@/lib/auth';
import { errorText } from './forms/fields';
import { useFocusTrap } from '@/lib/useFocusTrap';

/**
 * Accounts made without a birth date (Google sign-in, older accounts) give it
 * once before chatting. Mounted in the layout.
 */
export function AgeGate() {
  const trap = useFocusTrap();
  const { user, token, refresh } = useAuth();
  const [birthDate, setBirthDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user || !token || user.birthDateSet) return null;
  return (
    <div ref={trap} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="age-title">
      <form
        className="w-full max-w-sm rounded-2xl bg-card p-6 text-[#f4f5f7] shadow-2xl"
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
        <p className="mt-1 text-sm text-mute">randomCall is for adults ({MIN_AGE}+). Please enter your date of birth — you only do this once.</p>
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
          className="mt-1 w-full rounded-lg border border-line-2 px-3 py-2"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button disabled={busy || !birthDate} className="mt-4 w-full rounded-lg bg-lime py-2.5 font-semibold text-night disabled:opacity-50">
          {busy ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}

/** Why this account can't chat right now (shown on the home page). */
export function AgeHoldNotice() {
  const { user, logout } = useAuth();
  if (!user?.ageHold) return null;
  const under = user.ageHold === 'under-18';
  return (
    <section className="flex flex-col gap-3 rounded-[22px] border border-divider bg-[rgba(23,18,31,.94)] p-5 text-center sm:p-6">
      <span aria-hidden className={`flex h-14 w-14 items-center justify-center self-center rounded-full ${under ? 'bg-[#FF8A801F] text-stop-text' : 'bg-[#A36BFF1F] text-[#A36BFF]'}`}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          {under ? <path d="M5.6 5.6l12.8 12.8" /> : <path d="M9 10h.01M15 10h.01M9 15c1.5 1.5 4.5 1.5 6 0" />}
        </svg>
      </span>
      <h2 className="m-0 font-display text-[22px] font-bold leading-[1.15] text-[#f4f5f7]">{under ? `randomCall is ${MIN_AGE}+ only` : 'Quick age check'}</h2>
      {under ? (
        <p className="m-0 text-sm leading-normal text-mute">
          randomCall is only for people aged {MIN_AGE} and over, so chatting is turned off for this account.
        </p>
      ) : (
        <>
          <p className="m-0 text-sm leading-normal text-mute">
            Keep randomCall {MIN_AGE}+. Take a quick selfie: we estimate your age and delete the photo straight away.
          </p>
          <p className="m-0 rounded-xl bg-card-2 px-3.5 py-3 text-left text-[13px] leading-normal text-[#c9cdd4]">
            <b className="text-[#f4f5f7]">Why now?</b> Someone reported this account as under {MIN_AGE}. Chats are paused until it&apos;s done.
          </p>
          <Link
            href="/get-verified"
            className="mt-1 flex h-[52px] w-full items-center justify-center rounded-[14px] bg-lime font-display text-base font-bold text-night"
          >
            Take selfie
          </Link>
          <button type="button" onClick={() => void logout()} className="flex h-11 w-full items-center justify-center text-sm font-semibold text-mute hover:text-white">
            Log out
          </button>
        </>
      )}
    </section>
  );
}
