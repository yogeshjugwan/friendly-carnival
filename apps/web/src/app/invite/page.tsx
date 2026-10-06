'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { REFERRAL, type ReferralInfo } from '@rc/shared';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { errorText, FormError } from '@/components/forms/fields';
import { api, useAuth } from '@/lib/auth';

export default function InvitePage() {
  const { user, token, loading } = useAuth();
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare('share' in navigator), []);

  useEffect(() => {
    if (!token) return;
    api<ReferralInfo>('/auth/referral', undefined, token)
      .then(setInfo)
      .catch((e) => setError(errorText(e)));
  }, [token]);

  const link = info ? `${window.location.origin}/r/${info.code}` : '';
  const message = `Talk to new people on randomCall — sign up with my link and we both get a free day of Plus: ${link}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError('Could not copy. Select the link and copy it yourself.');
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: 'randomCall', text: message, url: link });
    } catch {
      /* closed */
    }
  };

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <SiteHeader />
      <section className="mt-2 text-center">
        <p className="text-5xl" aria-hidden>
          🎁
        </p>
        <h1 className="mt-3 text-3xl font-bold">Invite friends, get Plus free</h1>
        <p className="mt-2 text-slate-300">
          When a friend signs up with your link and finishes their first chat, you both get{' '}
          <strong className="text-amber-300">
            {REFERRAL.plusDays} free day{REFERRAL.plusDays > 1 ? 's' : ''} of 👑 Plus
          </strong>
          . Already paying for Plus? You get 🪙 {REFERRAL.coins} coins instead.
        </p>
      </section>

      <FormError error={error} />

      {loading ? null : !user ? (
        <p className="rounded-xl bg-white/5 p-4 text-center text-slate-300">
          <Link href="/signup?next=/invite" className="font-semibold text-sky-300 underline">
            Create a free account
          </Link>{' '}
          to get your invite link.
        </p>
      ) : (
        <section className="rounded-2xl bg-white p-5 text-ink sm:p-6">
          <label htmlFor="invite-link" className="text-sm font-semibold">
            Your invite link
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="invite-link"
              readOnly
              value={link || 'Loading…'}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 font-mono text-sm"
            />
            <button
              onClick={() => void copy()}
              disabled={!info}
              className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {copied ? 'Copied ✓' : 'Copy link'}
            </button>
          </div>
          {info && (
            <div className="mt-3 flex flex-wrap gap-2">
              {canShare && (
                <button onClick={() => void share()} className="rounded-full bg-slate-800 px-4 py-2 text-sm font-semibold text-white">
                  Share…
                </button>
              )}
              <a
                href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white"
              >
                WhatsApp
              </a>
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Sign up with my link and we both get a free day of Plus')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-[#229ED9] px-4 py-2 text-sm font-semibold text-white"
              >
                Telegram
              </a>
            </div>
          )}
          {info && (
            <dl className="mt-5 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-slate-100 p-3">
                <dt className="text-xs text-slate-500">Signed up</dt>
                <dd className="text-2xl font-bold">{info.invited}</dd>
              </div>
              <div className="rounded-xl bg-slate-100 p-3">
                <dt className="text-xs text-slate-500">Rewards earned</dt>
                <dd className="text-2xl font-bold">{info.rewarded}</dd>
              </div>
            </dl>
          )}
          <p className="mt-4 text-xs text-slate-500">
            Rewards count when your friend confirms their email and has their first chat with someone else. Up to {REFERRAL.maxRewards} rewards
            per account.
          </p>
        </section>
      )}
      <SiteFooter />
    </main>
  );
}
