'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { loadSettings } from '@/lib/settings';
import { PlusModal } from './PlusModal';
import { CameraIcon } from './UiIcons';

/**
 * Frame for the account pages (Compact design): a sidebar on larger screens
 * (logo, Start chat, the sections, a Plus card) and a text tab bar on phones.
 * Pages put their content in `children`; `title` is the page heading and
 * `actions` sits on the right of the heading row (coins and avatar by default).
 */
const NAV: [string, string, React.ReactNode][] = [
  ['/history', 'History', <path key="h" d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2" />],
  ['/messages', 'Messages', <path key="m" d="M21 12a8 8 0 0 1-12 7l-5 1 1-4a8 8 0 1 1 16-4z" />],
  ['/coins', 'Coins', <path key="c" d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 12h6M12 9v6" />],
  ['/invite', 'Invite', <path key="i" d="M9 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM2 21c0-4 3-6 7-6s7 2 7 6M19 8v6M16 11h6" />],
  [
    '/settings',
    'Settings',
    <path
      key="s"
      d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1c.6.5 1.3.9 2 1.2L10 21h4l.5-2.6c.7-.3 1.4-.7 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"
    />,
  ],
];

const TABS: [string, string][] = [
  ['/', 'Chat'],
  ['/history', 'History'],
  ['/messages', 'Messages'],
  ['/coins', 'Coins'],
  ['/settings', 'Me'],
];

export function ShellLogo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 font-display text-[19px] font-bold text-[#f4f5f7]" aria-label="randomCall home">
      <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-lime">
        <CameraIcon className="h-[17px] w-[17px]" color="#0b0d10" strokeWidth={2.4} />
      </span>
      randomCall
    </Link>
  );
}

/** "● 120 coins" and the avatar circle (or Log in). */
export function ShellActions() {
  const { user } = useAuth();
  if (!user) {
    return (
      <Link href="/login" className="flex h-10 items-center rounded-xl border border-line-2 px-4 text-sm text-[#e6e8ec] hover:border-[#3a3f4a]">
        Log in
      </Link>
    );
  }
  const name = loadSettings().name || user.email.split('@')[0];
  const avatar = loadSettings().avatar;
  return (
    <div className="flex items-center gap-2.5">
      <Link href="/coins" className="flex h-10 items-center gap-1.5 rounded-full bg-gold-bg px-3.5 text-sm font-semibold text-gold max-sm:h-8 max-sm:text-xs">
        ● {user.wallet.coins.toLocaleString()} coins
      </Link>
      <Link
        href="/settings"
        aria-label="Your profile"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-[linear-gradient(165deg,#3a4a6e,#1a2033)] font-display text-[15px] font-bold max-sm:hidden"
      >
        {avatar ?? name[0]?.toUpperCase()}
      </Link>
    </div>
  );
}

export function AppShell({ title, actions, children }: { title: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [plusOpen, setPlusOpen] = useState(false);
  const { user } = useAuth();
  const plusUntil = user?.plus.active && user.plus.until ? new Date(user.plus.until).toLocaleDateString() : null;
  return (
    <div className="flex min-h-dvh bg-night text-[#f4f5f7]">
      <aside className="sticky top-0 flex h-dvh w-[248px] shrink-0 flex-col gap-1 border-r border-[#1a1422] px-4 py-5 max-lg:hidden">
        <div className="px-2 pb-5">
          <ShellLogo />
        </div>
        <Link href="/" className="mb-3 flex h-12 items-center justify-center rounded-[14px] bg-lime font-display text-base font-bold text-night">
          Start chat
        </Link>
        {NAV.map(([href, label, icon]) => {
          const on = path === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? 'page' : undefined}
              className={`flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium ${on ? 'bg-card-2 text-[#f4f5f7]' : 'text-mute hover:bg-card hover:text-[#f4f5f7]'}`}
            >
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {icon}
              </svg>
              {label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => (user?.plus.active ? router.push('/plus') : setPlusOpen(true))}
          className="mt-auto flex flex-col gap-1 rounded-2xl border border-[#4a3f17] bg-gold-bg p-3.5 text-left text-gold"
        >
          <strong className="font-display text-[15px]">{user?.plus.active ? 'Plus active' : 'Get Plus'}</strong>
          <span className="text-xs text-[#cdb766]">{plusUntil ? `Until ${plusUntil}` : 'Gender & country filters'}</span>
        </button>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 pb-[100px] pt-5 sm:px-10 sm:pt-6 lg:pb-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="m-0 font-display text-[26px] font-bold sm:text-[30px]">{title}</h1>
          {actions ?? <ShellActions />}
        </header>
        {children}
      </main>

      {/* Phones and tablets: text tabs with a lime bar over the current one. */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid h-[76px] grid-cols-5 border-t border-[#1a1422] bg-[#0e0a13] px-2 pb-3 lg:hidden">
        {TABS.map(([href, label]) => {
          const on = path === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1.5 text-xs font-semibold ${on ? 'text-lime' : 'text-[#8a8f99]'}`}
            >
              <span className={`h-[3px] w-5 rounded-sm ${on ? 'bg-lime' : 'bg-transparent'}`} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
      {plusOpen && <PlusModal onClose={() => setPlusOpen(false)} />}
    </div>
  );
}
