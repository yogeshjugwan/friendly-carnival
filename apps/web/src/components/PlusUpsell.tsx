'use client';

import Link from 'next/link';
import { BoltIcon, ClockIcon, CrownIcon, EyeOffIcon, GlobeIcon, UsersIcon } from './UiIcons';

export const PLUS_FEATURES = [
  { icon: <UsersIcon className="h-4 w-4" />, title: 'Gender filter', body: 'Meet only girls or only boys.' },
  { icon: <GlobeIcon className="h-4 w-4" />, title: 'Country filter', body: 'Chat with people from the country you pick.' },
  { icon: <ClockIcon className="h-4 w-4" />, title: 'Online list', body: 'See who is online now and call them directly.' },
  { icon: <BoltIcon className="h-4 w-4" />, title: 'Unlimited matches', body: 'No daily limit and no ad before each match.' },
  { icon: <EyeOffIcon className="h-4 w-4" />, title: 'No ads', body: 'No ad box and no ad between strangers.' },
  { icon: <CrownIcon className="h-4 w-4" />, title: 'Plus badge', body: 'Partners see that you are a Plus member.' },
];

/** Gold icon tile + title + one line per feature (the modal and the Plus page). */
export function PlusFeatureList({ className = '' }: { className?: string }) {
  return (
    <ul className={`m-0 flex list-none flex-col gap-3 p-0 ${className}`}>
      {PLUS_FEATURES.map((f) => (
        <li key={f.title} className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-gold-bg text-gold">{f.icon}</span>
          <span className="min-w-0 text-sm">
            <span className="font-semibold text-[#f4f5f7]">{f.title}</span>
            <span className="block text-[13px] text-dim">{f.body}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Modal shown when a free user tries a Plus feature (a bottom sheet on phones). */
export function PlusUpsell({ onClose, reason }: { onClose: () => void; reason?: string }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Upgrade to Plus"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-dvh w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-[24px] border border-line bg-night bg-[radial-gradient(circle_at_50%_0%,#2A220A_0%,#07080B_60%)] p-5 pb-[max(env(safe-area-inset-bottom),20px)] text-[#f4f5f7] shadow-2xl sm:rounded-[24px] sm:p-6">
        <div className="flex items-start justify-between">
          <span className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-gold text-gold-bg">
            <CrownIcon className="h-7 w-7" />
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-card-2 text-[#e6e8ec] hover:bg-line"
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gold">randomCall Plus</p>
          <h2 className="mt-1 font-display text-[26px] font-bold leading-tight">{reason ?? 'Choose who you meet'}</h2>
        </div>
        <PlusFeatureList />
        <Link
          href="/plus"
          className="mt-2 flex h-[54px] items-center justify-center rounded-2xl bg-gold font-display text-[17px] font-bold text-gold-bg hover:brightness-110"
        >
          See plans
        </Link>
        <button onClick={onClose} className="h-11 rounded-xl text-sm font-medium text-mute hover:text-white">
          Not now
        </button>
      </div>
    </div>
  );
}
