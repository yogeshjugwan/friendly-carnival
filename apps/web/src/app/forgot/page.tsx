'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { errorText } from '@/components/forms/fields';
import { useGoogleEnabled } from '@/components/forms/social';
import { api } from '@/lib/auth';

const RESEND_AFTER = 45;

export default function ForgotPage() {
  const google = useGoogleEnabled();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [wait, setWait] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait(wait - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/auth/forgot', { email });
      setSent(true);
      setWait(RESEND_AFTER);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

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
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <circle cx="8" cy="15" r="4" />
            <path d="M11 12l9-9M17 6l3 3" />
          </svg>
        </span>

        {sent ? (
          <>
            <h1 className="m-0 font-display text-[26px] font-bold leading-[1.15] lg:text-[32px]">Check your email</h1>
            <p role="status" className="m-0 text-[15px] leading-normal text-mute">
              If an account exists for {email}, a reset link is on its way. It expires in 1 hour. Check spam too.
            </p>
            {error && (
              <p role="alert" className="m-0 rounded-xl border border-[#4a2424] bg-[#2a1616] px-3 py-2 text-sm text-stop-text">
                {error}
              </p>
            )}
            <Link href="/login" className="flex h-[54px] items-center justify-center rounded-[14px] bg-lime font-display text-[17px] font-bold text-night">
              Back to log in
            </Link>
            <button
              type="button"
              disabled={wait > 0 || busy}
              onClick={() => void send()}
              className="h-11 text-sm font-semibold text-lime disabled:text-mute"
            >
              Didn’t get it? Resend{wait > 0 ? ` (in 0:${String(wait).padStart(2, '0')})` : ''}
            </button>
          </>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <h1 className="m-0 font-display text-[26px] font-bold leading-[1.15] lg:text-[32px]">Forgot your password?</h1>
            <p className="m-0 text-[15px] leading-normal text-mute">Enter the email you signed up with. We’ll send you a link to set a new password.</p>
            <label htmlFor="email" className="flex flex-col gap-1.5 text-[13px] text-mute">
              Email
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-[50px] rounded-xl border border-line-2 bg-card px-3.5 text-[15px] text-[#f4f5f7] outline-none placeholder:text-faint focus:border-lime"
              />
            </label>
            {error && (
              <p role="alert" className="m-0 rounded-xl border border-[#4a2424] bg-[#2a1616] px-3 py-2 text-sm text-stop-text">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy} className="h-[54px] rounded-[14px] bg-lime font-display text-[17px] font-bold text-night disabled:opacity-50">
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
            {google && (
              <p className="m-0 text-[13px] text-faint">
                Signed up with Google? Use <b className="text-[#e6e8ec]">Continue with Google</b> instead — no password needed.
              </p>
            )}
          </form>
        )}
      </section>
    </main>
  );
}
