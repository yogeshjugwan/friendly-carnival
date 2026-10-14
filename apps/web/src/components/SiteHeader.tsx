'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { LanguagePicker, useI18n } from '@/lib/i18n';
import { loadSettings } from '@/lib/settings';
import { getSocket } from '@/lib/socket';
import { BubbleIcon, CameraIcon, ClockIcon, CoinIcon, GiftIcon, UserIcon } from './UiIcons';

export function Brand({ compact = false, wordmark = false }: { compact?: boolean; wordmark?: boolean }) {
  if (wordmark) {
    // Inner pages: just the name, "Call" in lime.
    return (
      <Link href="/" className="font-display text-xl font-bold tracking-[-0.01em] text-[#f4f5f7]" aria-label="randomCall home">
        random<span className="text-lime">Call</span>
      </Link>
    );
  }
  return (
    <Link href="/" className="flex items-center gap-2.5 text-[#e8ebf2]" aria-label="randomCall home">
      <span className={`flex items-center justify-center rounded-[10px] bg-lime ${compact ? 'h-[30px] w-[30px]' : 'h-9 w-9'}`}>
        <CameraIcon className={compact ? 'h-4 w-4' : 'h-5 w-5'} color="#07080b" strokeWidth={2.4} />
      </span>
      <span className={`font-display font-bold tracking-[-0.01em] ${compact ? 'text-lg' : 'text-[22px]'}`}>randomCall</span>
    </Link>
  );
}

/** Unread messages, for the dot on the Messages button. */
function useUnread(enabled: boolean) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!enabled) return setUnread(0);
    const socket = getSocket();
    const load = () =>
      socket.timeout(8_000).emit('dm:threads', (err, list) => setUnread(err || !list ? 0 : list.reduce((n, t) => n + t.unread, 0)));
    load();
    socket.on('dm:new', load);
    socket.on('dm:read', load);
    return () => {
      socket.off('dm:new', load);
      socket.off('dm:read', load);
    };
  }, [enabled]);
  return unread;
}

/** Header pill (History, Messages, Invite, coins, account); lime on the current page. */
const navPill = (on: boolean) =>
  `relative flex h-10 items-center gap-2 rounded-xl border px-3.5 text-[13px] font-medium transition ${
    on ? 'border-lime bg-lime text-night' : 'border-line bg-card text-[#c9cdd4] hover:border-line-2 hover:text-white'
  }`;

/** Account pill with a small menu. */
export function AccountMenu() {
  const { user, logout } = useAuth();
  const path = usePathname();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const name = loadSettings().name || user.email.split('@')[0];
  const avatar = loadSettings().avatar;
  const onSettings = path === '/settings';
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`${navPill(onSettings)} max-sm:h-11 max-sm:w-11 max-sm:justify-center max-sm:rounded-full max-sm:border-2 max-sm:border-gold max-sm:p-0`}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-card-2 text-[13px] font-semibold sm:hidden">{avatar ?? name[0]?.toUpperCase()}</span>
        <span className="max-w-[10rem] truncate max-sm:hidden">{name}</span>
        {user.plus.active && <span className={`text-[11px] font-bold tracking-[0.04em] max-sm:hidden ${onSettings ? 'text-night' : 'text-gold'}`}>· PLUS</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-line bg-card py-1 text-sm shadow-2xl">
            {[
              ['/settings', t('header.settings')],
              ['/plus', user.plus.active ? t('header.plusMember') : t('header.getPlus')],
              ['/coins', '🪙 Coins'],
              ['/get-verified', '✓ Get verified'],
              ['/invite', t('footer.invite')],
            ].map(([href, label]) => (
              <Link key={href} role="menuitem" href={href} className="block px-4 py-2.5 text-[#d6dae3] hover:bg-card-2 hover:text-white">
                {label}
              </Link>
            ))}
            <button
              role="menuitem"
              onClick={() => void logout()}
              className="block w-full border-t border-line px-4 py-2.5 text-left text-[#d6dae3] hover:bg-card-2 hover:text-white"
            >
              Log out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Top bar for the landing, account and legal pages. */
export function SiteHeader({ online, home = false }: { online?: number | null; home?: boolean }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const path = usePathname();
  const unread = useUnread(!!user);
  return (
    // Phones: inner pages start with their own title (the tab bar does the navigating), so only the home page shows this bar.
    <header className={`-mx-4 sm:-mx-6 ${home ? '' : 'max-sm:hidden'}`}>
      <div className={`mx-auto flex flex-wrap items-center gap-3 px-4 py-4 sm:gap-4 sm:px-12 sm:py-6 ${home ? 'max-w-none' : 'max-w-[1440px]'}`}>
        {home ? (
          <>
            <span className="sm:hidden">
              <Brand compact />
            </span>
            <span className="max-sm:hidden">
              <Brand />
            </span>
          </>
        ) : (
          <Brand wordmark />
        )}
        <div className="flex-1" />
        <nav className="flex flex-wrap items-center gap-2" aria-label="Account">
          {/* The online count is a Plus perk. */}
          {online !== undefined && !!user?.plus.active && online !== null && (
            <span className="mr-2 flex items-center gap-2 text-sm text-mute max-md:hidden">
              <i className="h-2 w-2 rounded-full bg-lime" aria-hidden />
              {online.toLocaleString()} {t('header.onlineNow')}
            </span>
          )}
          {!loading &&
            (user ? (
              <>
                <Link href="/history" aria-current={path === '/history' ? 'page' : undefined} className={`${navPill(path === '/history')} max-sm:hidden`}>
                  <ClockIcon className="h-4 w-4 lg:hidden" />
                  <span className="max-lg:sr-only">History</span>
                </Link>
                <Link
                  href="/messages"
                  aria-current={path === '/messages' ? 'page' : undefined}
                  aria-label={unread ? `Messages, ${unread} unread` : undefined}
                  className={`${navPill(path === '/messages')} max-sm:hidden`}
                >
                  <BubbleIcon className="h-4 w-4 lg:hidden" />
                  <span className="max-lg:sr-only">Messages</span>
                  {unread > 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-night bg-[#ff6b4a]" />}
                </Link>
                <Link href="/invite" aria-current={path === '/invite' ? 'page' : undefined} className={`${navPill(path === '/invite')} max-md:hidden`}>
                  {t('header.inviteShort')}
                </Link>
                {!user.plus.active && (
                  <Link href="/plus" className="flex h-10 items-center rounded-xl bg-gold px-3.5 text-[13px] font-semibold text-[#1a1608] hover:brightness-105 max-sm:hidden">
                    {t('header.upgrade')}
                  </Link>
                )}
                <Link href="/coins" aria-current={path === '/coins' ? 'page' : undefined} className={navPill(path === '/coins')} title="Coins">
                  <CoinIcon className={`h-4 w-4 ${path === '/coins' ? '' : 'text-gold'}`} />
                  {user.wallet.coins.toLocaleString()}
                  <span className="max-sm:hidden">coins</span>
                </Link>
                <AccountMenu />
              </>
            ) : (
              <>
                {/* Home already has Get Plus under the Start button (as in the design). */}
                <Link
                  href="/plus"
                  className={`flex h-10 items-center rounded-xl border border-[#4a3f17] bg-[rgba(20,22,28,.7)] px-3.5 text-sm font-semibold text-gold backdrop-blur-md hover:text-[#ffe48c] max-sm:hidden ${home ? 'hidden' : ''}`}
                >
                  {t('header.getPlus')}
                </Link>
                <Link href="/login" className="flex h-10 items-center rounded-xl bg-lime px-4 text-sm font-semibold text-night hover:bg-lime-hover">
                  {t('header.login')}
                </Link>
              </>
            ))}
          <LanguagePicker className="max-sm:hidden" />
        </nav>
      </div>
    </header>
  );
}

/** Phone tab bar (Chat · History · Coins · Invite · Me), fixed to the bottom. */
function MobileTabs() {
  const path = usePathname();
  const tabs: [string, string, React.ReactNode][] = [
    ['/', 'Chat', <CameraIcon key="c" className="h-[22px] w-[22px]" />],
    ['/history', 'History', <ClockIcon key="h" className="h-[22px] w-[22px]" />],
    ['/coins', 'Coins', <CoinIcon key="o" className="h-[22px] w-[22px]" />],
    ['/invite', 'Invite', <GiftIcon key="i" className="h-[22px] w-[22px]" />],
    ['/settings', 'Me', <UserIcon key="m" className="h-[22px] w-[22px]" />],
  ];
  return (
    <>
      <div className="h-[84px] sm:hidden" aria-hidden />
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-divider bg-tabbar pb-[max(env(safe-area-inset-bottom),10px)] pt-2.5 sm:hidden">
        {tabs.map(([href, label, icon]) => {
          const on = path === href || (href === '/history' && path === '/messages');
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? 'page' : undefined}
              className={`flex min-h-[52px] flex-col items-center justify-center gap-1 text-[11px] font-medium ${on ? 'text-lime' : 'text-dim'}`}
            >
              {icon}
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <>
      <footer className="-mx-4 mt-auto border-t border-line sm:-mx-6">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-5 text-[13px] text-dim sm:px-6">
          <span>© {new Date().getFullYear()} randomCall</span>
          {(
            [
              ['/terms', t('footer.terms')],
              ['/guidelines', t('footer.guidelines')],
              ['/privacy', t('footer.privacy')],
              ['/rooms', t('footer.rooms')],
              ['/help', t('footer.help')],
            ] as const
          ).map(([href, label]) => (
            <Link key={href} href={href} className="text-dim hover:text-white">
              {label}
            </Link>
          ))}
          <div className="flex-1" />
          <LanguagePicker className="sm:hidden" />
        </div>
      </footer>
      <MobileTabs />
    </>
  );
}

/** Centered card used by the login, signup and password pages. */
export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-full max-w-5xl flex-col px-4 py-6 sm:px-6">
      <SiteHeader />
      <section className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-sm rounded-[20px] border border-line bg-card p-6 text-[#f4f5f7] sm:p-7">
          <h1 className="m-0 font-display text-[26px] font-bold">{title}</h1>
          {children}
        </div>
      </section>
    </main>
  );
}
