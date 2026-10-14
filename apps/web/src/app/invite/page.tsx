'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { REFERRAL, type ReferralInfo } from '@rc/shared';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { errorText } from '@/components/forms/fields';
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

  const days = `${REFERRAL.plusDays} day${REFERRAL.plusDays > 1 ? 's' : ''} of Plus.`;
  const shareBtn =
    'flex h-11 flex-1 items-center justify-center rounded-xl border border-line-2 bg-card-2 px-[18px] text-[13px] font-semibold text-[#e6e8ec] hover:border-[#384056] sm:flex-none sm:text-sm';

  return (
    <main className="mx-auto flex min-h-full max-w-[1200px] flex-col gap-6 px-4 py-6 text-[#f4f5f7] sm:px-6">
      <SiteHeader />
      <div className="mx-auto mt-3 flex w-full max-w-[760px] flex-col gap-4 sm:mt-10 sm:gap-6 sm:text-center">
        <p className="text-xs font-bold tracking-[2px] text-lime sm:text-[13px]">INVITE FRIENDS</p>
        <h1 className="font-display text-[34px] font-bold leading-[1.05] sm:text-[56px] sm:tracking-[-1px]">
          Bring a friend. <br className="max-sm:hidden" />
          You both get <span className="text-gold">{days}</span>
        </h1>
        <p className="text-sm text-mute sm:text-base">
          When a friend signs up with your link and finishes their first chat, you both get {REFERRAL.plusDays} free day
          {REFERRAL.plusDays > 1 ? 's' : ''} of 👑 Plus. Already on Plus? You get 🪙 {REFERRAL.coins} coins instead.
        </p>

        {error && (
          <p role="alert" className="rounded-xl border border-stop bg-[#1a0f0f] px-3 py-2 text-left text-sm text-stop-text">
            {error}
          </p>
        )}

        {loading ? null : !user ? (
          <p className="rounded-[18px] border border-line bg-card p-4 text-mute sm:rounded-[20px] sm:p-6">
            <Link href="/signup?next=/invite" className="font-semibold text-lime underline">
              Create a free account
            </Link>{' '}
            to get your invite link.
          </p>
        ) : (
          <>
            <section aria-label="Your invite link" className="flex flex-col gap-2.5 rounded-[18px] border border-line bg-card p-3.5 text-left sm:gap-4 sm:rounded-[20px] sm:p-6">
              <label htmlFor="invite-link" className="sr-only">
                Your invite link
              </label>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <input
                  id="invite-link"
                  readOnly
                  value={link || 'Loading…'}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-[46px] min-w-0 flex-1 rounded-xl bg-card-2 px-3 font-mono text-[13px] font-medium text-[#c9cdd4] outline-none focus:ring-2 focus:ring-lime sm:h-[52px] sm:px-4 sm:text-[15px]"
                />
                <button
                  onClick={() => void copy()}
                  disabled={!info}
                  className="h-[52px] rounded-[14px] bg-lime px-6 font-display text-base font-bold text-[#0b0d10] hover:bg-lime-hover disabled:opacity-50 sm:rounded-xl sm:text-[15px]"
                >
                  {copied ? 'Copied ✓' : 'Copy link'}
                </button>
              </div>
              {info && (
                <div className="flex gap-2">
                  <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className={shareBtn}>
                    WhatsApp
                  </a>
                  <a
                    href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Sign up with my link and we both get a free day of Plus')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={shareBtn}
                  >
                    Telegram
                  </a>
                  {canShare && (
                    <button onClick={() => void share()} className={shareBtn}>
                      More…
                    </button>
                  )}
                </div>
              )}
            </section>
            {info && (
              <dl className="grid grid-cols-2 gap-2.5 text-left sm:gap-4">
                <div className="rounded-[18px] border border-line bg-card p-3.5 sm:rounded-[20px] sm:p-5">
                  <dt className="text-xs text-dim sm:text-[13px]">Signed up</dt>
                  <dd className="font-display text-[30px] font-bold sm:text-[40px]">{info.invited}</dd>
                </div>
                <div className="rounded-[18px] border border-line bg-card p-3.5 sm:rounded-[20px] sm:p-5">
                  <dt className="text-xs text-dim sm:text-[13px]">Rewards earned</dt>
                  <dd className="font-display text-[30px] font-bold sm:text-[40px]">
                    {info.rewarded} <span className="text-sm font-normal text-dim sm:text-base">/ {REFERRAL.maxRewards}</span>
                  </dd>
                </div>
              </dl>
            )}
            <p className="text-[11px] text-faint sm:text-xs">
              Rewards count when your friend confirms their email and has their first chat with someone else. Up to {REFERRAL.maxRewards}{' '}
              rewards per account.
            </p>
          </>
        )}
      </div>
      <SiteFooter />
    </main>
  );
}
