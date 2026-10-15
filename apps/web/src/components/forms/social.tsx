'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, API_URL } from '@/lib/auth';
import { markGoogleStart } from '@/lib/googleReturn';

export const GoogleLogo = () => (
  <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

/** Whether the server has Google sign-in configured (hidden until it says yes). */
export function useGoogleEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    api<{ google: boolean }>('/auth/providers')
      .then((p) => setEnabled(p.google))
      .catch(() => setEnabled(false));
  }, []);
  return enabled;
}

const ERRORS: Record<string, string> = {
  canceled: 'Google sign-in was canceled.',
  expired: 'That sign-in took too long. Please try again.',
  unverified: 'Your Google email is not verified.',
  google_disabled: 'Google sign-in is not available right now.',
  google_failed: 'Google sign-in failed. Please try again.',
  busy: 'Too many sign-ins right now. Please try again shortly.',
};
/** Message for ?error= after a failed Google sign-in. */
export const googleError = (code: string | null) => (code ? (ERRORS[code] ?? ERRORS.google_failed) : null);

/**
 * "Continue with Google" + "OR" divider. Needs the age/terms boxes ticked first,
 * because Google sign-in can create an account.
 */
export function GoogleSignIn({ agreed, onNeedAgreement, next }: { agreed: boolean; onNeedAgreement: () => void; next?: string | null }) {
  const enabled = useGoogleEnabled();
  const [blocked, setBlocked] = useState(false);
  const [going, setGoing] = useState(false);
  useEffect(() => {
    if (agreed) setBlocked(false);
  }, [agreed]);
  // Coming back with the browser's Back button: reset the button.
  useEffect(() => {
    const reset = () => setGoing(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);
  if (!enabled) return null;
  const href = `${API_URL}/auth/google/start?next=${encodeURIComponent(next ?? '/')}`;
  return (
    <>
      <a
        href={href}
        aria-disabled={going}
        onClick={(e) => {
          if (!agreed) {
            e.preventDefault();
            setBlocked(true);
            onNeedAgreement();
            document.getElementById('agreement')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
          }
          // The free server can take a while to wake up; show that something is happening.
          setGoing(true);
          markGoogleStart();
        }}
        className={`mt-4 flex h-[50px] w-full items-center justify-center gap-2.5 rounded-xl bg-white text-[15px] font-semibold text-[#1a1a1a] transition hover:bg-[#f1f1f1] ${going ? 'pointer-events-none opacity-70' : ''}`}
      >
        {going ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand" aria-hidden /> : <GoogleLogo />}
        {going ? 'Connecting to Google…' : 'Continue with Google'}
      </a>
      {blocked && (
        <p role="alert" className="mt-2 text-center text-sm font-medium text-stop-text">
          Tick both boxes below first ↓
        </p>
      )}
      <div className="my-4 flex items-center gap-3 text-xs font-medium text-dim">
        <span className="h-px flex-1 bg-line" />
        OR
        <span className="h-px flex-1 bg-line" />
      </div>
    </>
  );
}

/** "By creating an account or logging in, you certify that…" with the two required boxes. */
export function Agreement({
  adult,
  terms,
  onAdult,
  onTerms,
  highlight = false,
}: {
  adult: boolean;
  terms: boolean;
  onAdult: (v: boolean) => void;
  onTerms: (v: boolean) => void;
  /** Red outline after someone tried to continue without ticking. */
  highlight?: boolean;
}) {
  const missing = highlight && !(adult && terms);
  return (
    <fieldset
      id="agreement"
      className={`mt-4 rounded-xl text-[13px] text-mute transition ${missing ? 'bg-stop p-3 ring-2 ring-stop-text' : ''}`}
    >
      <legend className="mb-2">By creating an account or logging in, you certify that</legend>
      <label className="flex min-h-11 items-center gap-2.5">
        <input type="checkbox" checked={adult} onChange={(e) => onAdult(e.target.checked)} className="h-[22px] w-[22px] shrink-0 accent-lime" />
        <span>I am at least 18 years old.</span>
      </label>
      <label className="flex min-h-11 items-center gap-2.5">
        <input type="checkbox" checked={terms} onChange={(e) => onTerms(e.target.checked)} className="h-[22px] w-[22px] shrink-0 accent-lime" />
        <span>
          I have read and agree to the{' '}
          <Link href="/terms" className="text-lime underline">
            Terms of Use
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-lime underline">
            Privacy Policy
          </Link>
          .
        </span>
      </label>
    </fieldset>
  );
}
