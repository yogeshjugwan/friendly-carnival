'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { REFERRAL, type ReferralInfo } from '@rc/shared';
import { AppShell } from '@/components/AppShell';
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
    'flex h-[46px] flex-1 items-center justify-center rounded-xl border border-line-2 bg-card-2 text-[13px] font-semibold text-[#e6e8ec] hover:border-[#4a3f5c] lg:h-12 lg:flex-none lg:px-[18px] lg:text-sm';
  const card = 'rounded-2xl border border-line bg-card p-3.5 lg:rounded-[20px] lg:p-5';
  const note = 'once your friend confirms their email and has a first chat with someone else.';

  return (
    <AppShell
      title={
        <span className="flex items-center gap-2">
          <Link
            href="/settings"
            aria-label="Back"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-card-2 text-[#f4f5f7] lg:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </Link>
          <span className="max-lg:text-[22px]">Invite friends</span>
        </span>
      }
    >
      <div className="-mt-1.5 flex flex-col gap-3.5 lg:mt-0 lg:gap-5">
        <section
          aria-labelledby="invite-title"
          className="flex flex-col gap-3 rounded-[22px] border border-line bg-[radial-gradient(ellipse_80%_100%_at_100%_0%,#2a1426_0%,#17121f_65%)] px-[18px] py-[22px] lg:gap-[18px] lg:rounded-[20px] lg:bg-[radial-gradient(ellipse_60%_120%_at_100%_0%,#2a1426_0%,#17121f_60%)] lg:p-8"
        >
          <h2 id="invite-title" className="m-0 max-w-[560px] font-display text-[30px] font-bold leading-[1.05] tracking-[-.5px] lg:text-[40px] lg:tracking-[-1px]">
            Bring a friend. You both get <span className="text-lime">{days}</span>
          </h2>
          <p className="m-0 text-[13px] text-mute lg:text-[15px]">
            <span className="lg:hidden">On Plus already?</span>
            <span className="max-lg:hidden">Already on Plus?</span> You get {REFERRAL.coins} coins instead.
          </p>

          {error && (
            <p role="alert" className="m-0 rounded-xl border border-stop bg-[#1a0f0f] px-3 py-2 text-sm text-stop-text">
              {error}
            </p>
          )}

          {loading ? null : !user ? (
            <p className="m-0 text-sm text-mute">
              <Link href="/signup?next=/invite" className="font-semibold text-lime underline">
                Create a free account
              </Link>{' '}
              to get your invite link.
            </p>
          ) : (
            <>
              <div className="flex max-w-[720px] flex-col gap-3 lg:flex-row lg:flex-wrap lg:gap-2">
                <label className="flex min-w-0 flex-col gap-1.5 text-xs text-mute lg:flex-[1_1_280px] lg:text-[13px]">
                  <span>
                    Your <span className="max-lg:hidden">invite </span>link
                  </span>
                  <input
                    readOnly
                    value={link || 'Loading…'}
                    onFocus={(e) => e.currentTarget.select()}
                    className="h-12 min-w-0 rounded-xl border border-line-2 bg-[#120d18] px-3 text-sm font-medium text-[#f4f5f7] outline-none focus:border-lime lg:h-[52px] lg:px-3.5 lg:text-[15px]"
                  />
                </label>
                <button
                  onClick={() => void copy()}
                  disabled={!info}
                  className="h-[52px] rounded-[14px] bg-lime px-6 font-display text-base font-bold text-night hover:bg-lime-hover disabled:opacity-50 lg:self-end lg:rounded-xl"
                >
                  {copied ? 'Copied ✓' : 'Copy link'}
                </button>
              </div>
              {info && (
                <div className="flex gap-2 lg:flex-wrap">
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
                      More<span className="max-lg:hidden">…</span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {user && (
          <>
            <dl className="m-0 grid grid-cols-2 gap-2 lg:grid-cols-3 lg:gap-4">
              <div className={card}>
                <dt className="text-xs text-mute lg:text-[13px]">Signed up</dt>
                <dd className="m-0 font-display text-[26px] font-bold lg:text-[34px]">{info?.invited ?? 0}</dd>
              </div>
              <div className={card}>
                <dt className="text-xs text-mute lg:text-[13px]">
                  Rewards<span className="max-lg:hidden"> earned</span>
                </dt>
                <dd className="m-0 font-display text-[26px] font-bold lg:text-[34px]">
                  {info?.rewarded ?? 0} <span className="text-sm text-[#8a8f99] lg:text-base">/ {REFERRAL.maxRewards}</span>
                </dd>
              </div>
              <p className={`m-0 flex items-center text-[13px] leading-normal text-mute max-lg:hidden ${card}`}>Counts {note}</p>
            </dl>
            <p className="m-0 text-xs leading-normal text-mute lg:hidden">Counts {note}</p>
          </>
        )}
      </div>
    </AppShell>
  );
}
