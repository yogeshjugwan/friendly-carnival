'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MIN_PASSWORD_LENGTH } from '@rc/shared';
import { errorText, tokenFromUrl } from '@/components/forms/fields';
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
    <main className="flex min-h-dvh justify-center bg-night bg-[radial-gradient(circle_at_50%_0%,#1E0F2A_0%,#0B0811_50%)] px-5 pb-7 pt-4 text-[#f4f5f7] lg:items-center lg:bg-[radial-gradient(ellipse_50%_60%_at_50%_40%,#1E0F2A_0%,#0B0811_70%)] lg:p-6">
      <section className="flex w-full max-w-[440px] flex-col gap-4 lg:rounded-[26px] lg:border lg:border-divider lg:bg-card lg:p-8">
        <Link href="/login" className="flex h-11 items-center gap-1.5 self-start text-sm text-mute hover:text-[#f4f5f7]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Back to log in
        </Link>
        <span aria-hidden className="grid h-16 w-16 place-items-center rounded-full bg-pick text-lime">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </span>

        {done ? (
          <>
            <h1 className="m-0 font-display text-[26px] font-bold leading-[1.15] lg:text-[32px]">Password changed</h1>
            <p role="status" className="m-0 text-[15px] leading-normal text-mute">
              You were signed out on all devices. Log in with your new password.
            </p>
            <Link href="/login" className="flex h-[54px] items-center justify-center rounded-[14px] bg-lime font-display text-[17px] font-bold text-night">
              Log in
            </Link>
          </>
        ) : (
          <form
            className="flex flex-col gap-4"
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
            <h1 className="m-0 font-display text-[26px] font-bold leading-[1.15] lg:text-[32px]">Choose a new password</h1>
            <p className="m-0 text-[15px] leading-normal text-mute">Use at least {MIN_PASSWORD_LENGTH} characters. You’ll be signed out on all devices.</p>
            <label htmlFor="password" className="flex flex-col gap-1.5 text-[13px] text-mute">
              New password
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-[50px] rounded-xl border border-[#6b5d84] bg-night px-3.5 text-[15px] text-[#f4f5f7] outline-none placeholder:text-faint focus:border-lime"
              />
            </label>
            {error && (
              <p role="alert" className="m-0 rounded-xl border border-[#4a2424] bg-[#2a1616] px-3 py-2 text-sm text-stop-text">
                {error}{' '}
                <Link href="/forgot" className="font-semibold text-lime underline">
                  Get a new link
                </Link>
              </p>
            )}
            <button type="submit" disabled={busy} className="h-[54px] rounded-[14px] bg-lime font-display text-[17px] font-bold text-night disabled:opacity-50">
              {busy ? 'Saving…' : 'Save password'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
