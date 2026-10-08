'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { LanguagePicker, useI18n } from '@/lib/i18n';
import { loadSettings } from '@/lib/settings';
import { getSocket } from '@/lib/socket';
import { InstallButton } from './Pwa';
import { BubbleIcon, CameraIcon, ChevronDownIcon2, ClockIcon, CoinIcon, GiftIcon } from './UiIcons';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-[#e8ebf2]" aria-label="randomCall home">
      <span className={`flex items-center justify-center rounded-[10px] bg-lime ${compact ? 'h-[30px] w-[30px]' : 'h-[34px] w-[34px]'}`}>
        <CameraIcon className="h-[18px] w-[18px]" color="#0c0e14" strokeWidth={2.2} />
      </span>
      <span className={`font-display font-extrabold tracking-[-0.02em] ${compact ? 'text-[19px]' : 'text-[22px]'}`}>randomCall</span>
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

const iconBtn =
  'relative flex h-10 w-10 items-center justify-center rounded-[10px] border border-line bg-card text-[#b7becc] transition hover:border-line-2 hover:text-white';

/** Account pill with a small menu. */
export function AccountMenu() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const name = loadSettings().name || user.email.split('@')[0];
  const avatar = loadSettings().avatar;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-10 items-center gap-2.5 rounded-full border border-line bg-card pl-1 pr-2 text-sm text-[#e8ebf2] max-sm:h-11 max-sm:w-11 max-sm:justify-center max-sm:border-2 max-sm:border-gold max-sm:p-0"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2a2f3d] text-[13px] font-semibold">{avatar ?? name[0]?.toUpperCase()}</span>
        <span className="max-w-[10rem] truncate max-sm:hidden">{name}</span>
        {user.plus.active && <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] font-bold tracking-[0.04em] text-[#1a1608] max-sm:hidden">PLUS</span>}
        <ChevronDownIcon2 className="h-3.5 w-3.5 max-sm:hidden" color="#8a92a3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-line bg-card py-1 text-sm shadow-2xl">
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
export function SiteHeader({ online }: { online?: number | null }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const unread = useUnread(!!user);
  return (
    <header className="-mx-4 border-b border-line sm:-mx-6">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-3 px-4 py-3.5 sm:gap-4 sm:px-6 sm:py-4">
        <span className="sm:hidden">
          <Brand compact />
        </span>
        <span className="max-sm:hidden">
          <Brand />
        </span>
        {/* The online count is a Plus perk. */}
        {online !== undefined && !!user?.plus.active && (
          <span className="flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 text-[13px] text-[#b7becc] max-sm:hidden">
            <span className="h-2 w-2 rounded-full bg-[#3ddc84]" />
            {online === null ? (
              t('status.connecting')
            ) : (
              <span>
                <b className="font-semibold text-[#e8ebf2]">{online.toLocaleString()}</b> {t('header.onlineNow')}
              </span>
            )}
          </span>
        )}
        <div className="flex-1" />
        <nav className="flex flex-wrap items-center gap-1.5" aria-label="Account">
          {!loading &&
            (user ? (
              <>
                <Link href="/history" className={`${iconBtn} max-sm:hidden`} aria-label="History" title="History">
                  <ClockIcon />
                </Link>
                <Link href="/messages" className={`${iconBtn} max-sm:hidden`} aria-label={unread ? `Messages, ${unread} unread` : 'Messages'} title="Messages">
                  <BubbleIcon />
                  {unread > 0 && <span className="absolute right-[7px] top-[7px] h-2 w-2 rounded-full border-2 border-card bg-[#ff6b4a]" />}
                </Link>
                <Link
                  href="/invite"
                  className="flex h-10 items-center gap-2 rounded-[10px] border border-line bg-card px-3.5 text-sm text-[#e8ebf2] hover:border-line-2 max-md:hidden"
                >
                  <GiftIcon className="h-4 w-4" />
                  {t('header.inviteShort')}
                </Link>
                {!user.plus.active && (
                  <Link href="/plus" className="flex h-10 items-center rounded-[10px] bg-gold px-3.5 text-sm font-semibold text-[#1a1608] hover:brightness-105 max-sm:hidden">
                    {t('header.upgrade')}
                  </Link>
                )}
                <Link
                  href="/coins"
                  className="flex h-10 items-center gap-2 rounded-[10px] border border-[#3a3418] bg-[#1b1a10] px-3 text-sm font-semibold text-gold max-sm:h-11"
                  title="Coins"
                >
                  <CoinIcon className="h-4 w-4" />
                  {user.wallet.coins.toLocaleString()}
                  <span className="max-sm:hidden">coins</span>
                </Link>
                <span className="mx-1.5 h-6 w-px bg-line max-sm:hidden" aria-hidden />
                <AccountMenu />
              </>
            ) : (
              <>
                <Link href="/plus" className="flex h-10 items-center px-2 text-sm font-semibold text-gold hover:text-[#ffe48c] max-sm:hidden">
                  {t('header.getPlus')}
                </Link>
                <Link href="/login" className="flex h-10 items-center rounded-[10px] px-3 text-sm font-medium text-[#e8ebf2] hover:bg-card">
                  {t('header.login')}
                </Link>
                <Link href="/signup" className="flex h-10 items-center rounded-[10px] bg-lime px-4 text-sm font-semibold text-night hover:bg-lime-hover">
                  {t('header.signup')}
                </Link>
              </>
            ))}
          <LanguagePicker className="max-sm:hidden" />
        </nav>
      </div>
    </header>
  );
}

/** Phone tab bar (Chat · Messages · History · Invite), fixed to the bottom. */
function MobileTabs() {
  const path = usePathname();
  const tabs: [string, string, React.ReactNode][] = [
    ['/', 'Chat', <CameraIcon key="c" className="h-5 w-5" />],
    ['/messages', 'Messages', <BubbleIcon key="m" className="h-5 w-5" />],
    ['/history', 'History', <ClockIcon key="h" className="h-5 w-5" />],
    ['/invite', 'Invite', <GiftIcon key="i" className="h-5 w-5" />],
  ];
  return (
    <>
      <div className="h-20 sm:hidden" aria-hidden />
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-[#10131b] px-2 pb-[max(env(safe-area-inset-bottom),12px)] pt-2 sm:hidden">
        {tabs.map(([href, label, icon]) => {
          const on = path === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? 'page' : undefined}
              className={`flex min-h-[52px] flex-col items-center justify-center gap-1 text-[11px] ${on ? 'font-semibold text-lime' : 'text-dim'}`}
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
          <InstallButton />
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
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-ink shadow-xl">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {children}
        </div>
      </section>
    </main>
  );
}
