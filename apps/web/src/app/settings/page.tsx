'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { ageLabel, MIN_PASSWORD_LENGTH, type PublicUser, type UserSettings } from '@rc/shared';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { errorText } from '@/components/forms/fields';
import { api, useAuth } from '@/lib/auth';
import { loadSettings } from '@/lib/settings';
import { BlockedList } from '@/components/BlockedList';
import { InstallButton, NotificationsToggle } from '@/components/Pwa';
import { ProfileEditor } from '@/components/ProfileEditor';

/** Phones show one view at a time (like an app's "Me" tab); desktop shows every card side by side. */
type View = 'main' | 'profile' | 'account' | 'privacy';

const card = 'rounded-[18px] border border-line bg-card lg:rounded-[20px]';
const input =
  'h-[46px] w-full rounded-xl border border-line-2 bg-card-2 px-3.5 text-base text-[#f4f5f7] outline-none placeholder:text-faint focus:border-lime';
const label = 'flex flex-col gap-1.5 text-[13px] text-mute';
const pill =
  'inline-flex h-11 flex-none items-center justify-center rounded-xl border border-line bg-card px-3.5 text-[13px] font-medium text-[#c9cdd4] hover:border-line-2 disabled:opacity-50';
const primary =
  'h-14 w-full rounded-2xl bg-lime font-display text-[17px] font-bold text-[#0b0d10] hover:bg-lime-hover disabled:opacity-50 lg:h-12 lg:rounded-xl lg:text-[15px]';

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-xl border border-stop bg-[#1a0f0f] px-3 py-2 text-sm text-stop-text">
      {children}
    </p>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="rounded-xl border border-[#2c3a14] bg-[#12170a] px-3 py-2 text-sm text-lime">
      {children}
    </p>
  );
}

/** A labelled on/off switch (44×26 track, 44px tap target). */
function SwitchRow({
  checked,
  onChange,
  title,
  detail,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  detail?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 px-3.5 py-3 lg:px-0 lg:py-0">
      <div className="min-w-0">
        <div id={`${id}-t`} className="text-sm font-semibold text-[#f4f5f7] lg:text-[15px]">
          {title}
        </div>
        {detail && (
          <div id={`${id}-d`} className="text-xs text-dim lg:text-[13px]">
            {detail}
          </div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-t`}
        aria-describedby={detail ? `${id}-d` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="-my-2 flex h-11 w-14 flex-none items-center justify-center rounded-full disabled:opacity-50"
      >
        <span className={`relative h-[26px] w-11 rounded-full transition-colors ${checked ? 'bg-lime' : 'bg-line-2'}`}>
          <span
            className={`absolute top-[3px] h-5 w-5 rounded-full transition-all ${checked ? 'left-[21px] bg-[#0b0d10]' : 'left-[3px] bg-[#7d828c]'}`}
          />
        </span>
      </button>
    </div>
  );
}

const Chevron = () => (
  <span className="text-faint" aria-hidden>
    ›
  </span>
);

/** Phone sub-view header: round back button + title. */
function PhoneBack({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2.5 lg:hidden">
      <button type="button" aria-label="Back to settings" onClick={onBack} className="grid h-11 w-11 place-items-center rounded-full bg-card-2 text-[#e6e8ec]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <h1 className="font-display text-[22px] font-bold text-[#f4f5f7]">{title}</h1>
    </div>
  );
}

const plusText = (user: PublicUser) =>
  user.plus.active
    ? `👑 Active${user.plus.until ? ` until ${new Date(user.plus.until).toLocaleDateString()}` : ''}${user.plus.cancelAtPeriodEnd ? ' (will not renew)' : ''}`
    : 'Unlock gender and country filters and remove ads';

const badgeText = (user: PublicUser) =>
  user.verification === 'verified'
    ? '✓ Verified — partners see the blue badge'
    : user.verification === 'pending'
      ? '⏳ Selfie under review'
      : 'Show strangers you are a real person with a quick selfie';

export default function SettingsPage() {
  const { user, token, loading, saveSettings, logout, forget, refresh } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [emailsBusy, setEmailsBusy] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [view, setView] = useState<View>('main');
  const [active, setActive] = useState('profile');

  // Load once: later `user` updates (after a toggle saves, or emails/verification refresh) must not wipe unsaved profile edits.
  useEffect(() => {
    if (loading || settings) return;
    const s = user?.settings ?? loadSettings();
    setSettings(s);
    setWelcome(new URLSearchParams(window.location.search).has('welcome'));
  }, [loading, user, settings]);

  if (!settings) {
    return (
      <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
        <SiteHeader />
      </main>
    );
  }

  const update = (patch: Partial<UserSettings>) => {
    setSettings({ ...settings, ...patch });
    setSaved(false);
  };

  /** Switches save straight away; only the switched field changes on top of what is already saved. */
  const saveToggle = async (patch: Partial<UserSettings>) => {
    const before = settings;
    setSettings({ ...settings, ...patch });
    setToggleError(null);
    try {
      await saveSettings({ ...(user?.settings ?? loadSettings()), ...patch });
    } catch (err) {
      setSettings(before);
      setToggleError(errorText(err));
    }
  };

  const go = (v: View) => {
    setView(v);
    window.scrollTo(0, 0);
  };

  const logOut = async () => {
    await logout();
    router.push('/');
  };

  const onPhone = (v: View) => (view === v ? '' : 'max-lg:hidden');
  const initial = (settings.name?.trim()[0] ?? 'S').toUpperCase();

  const sideItems: [string, string][] = [
    ['profile', 'Profile'],
    ...(user ? ([['account', 'Account']] as [string, string][]) : []),
    ['chat', user ? 'Notifications' : 'Chat'],
    ...(user ? ([['plus', 'Plus & badge']] as [string, string][]) : []),
    ['privacy', 'Privacy & blocks'],
  ];

  return (
    <main className="mx-auto flex min-h-full max-w-[1200px] flex-col gap-4 px-4 py-6 text-[#f4f5f7] sm:px-6">
      <SiteHeader />

      <div className="mt-2 grid items-start gap-4 lg:mt-4 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)] lg:gap-5">
        {/* Desktop side menu */}
        <aside className="flex flex-col gap-1 max-lg:hidden lg:sticky lg:top-6">
          <h1 className="mb-3 font-display text-[32px] font-bold">Settings</h1>
          <nav aria-label="Settings sections" className="flex flex-col gap-1">
            {sideItems.map(([id, text]) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={() => setActive(id)}
                aria-current={active === id ? 'true' : undefined}
                className={`flex h-[42px] items-center rounded-[10px] px-3.5 text-sm font-medium ${
                  active === id ? 'bg-card-2 text-[#f4f5f7]' : 'text-mute hover:text-[#f4f5f7]'
                }`}
              >
                {text}
              </a>
            ))}
          </nav>
        </aside>

        {/* Middle column: profile card, privacy & blocks */}
        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <div className={`flex flex-col gap-3.5 lg:hidden ${view === 'main' ? '' : 'hidden'}`}>
            <h1 className="font-display text-[26px] font-bold">Settings</h1>
            {welcome && user && <Note>Welcome! We sent a confirmation link to {user.email}.</Note>}
            <div className={`${card} flex items-center gap-3 p-3.5`}>
              <span className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-[14px] bg-gold font-display text-2xl font-bold text-gold-bg" aria-hidden>
                {initial}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <span className="truncate">{settings.name || (user ? user.email : 'Guest')}</span>
                  {user?.plus.active && <span className="flex-none text-[11px] font-bold text-gold">PLUS</span>}
                </div>
                <div className="truncate text-xs text-dim">
                  Partners see: {settings.name || 'Stranger'}
                  {settings.age ? ` · ${ageLabel(settings.age)}` : ''}
                </div>
              </div>
              <button type="button" onClick={() => go('profile')} className="h-11 flex-none rounded-[10px] border border-line-2 px-3.5 text-[13px] font-medium text-[#e6e8ec]">
                Edit
              </button>
            </div>
          </div>
          {welcome && user && (
            <div className="max-lg:hidden">
              <Note>Welcome! We sent a confirmation link to {user.email}.</Note>
            </div>
          )}

          <section id="profile" aria-labelledby="profile-h" className={`flex scroll-mt-6 flex-col gap-4 ${onPhone('profile')}`}>
            <PhoneBack title="Edit profile" onBack={() => go('main')} />
            <form
              className="flex flex-col gap-3.5 lg:rounded-[20px] lg:border lg:border-line lg:bg-card lg:p-[22px]"
              onSubmit={async (e) => {
                e.preventDefault();
                setSaving(true);
                setError(null);
                try {
                  await saveSettings(settings);
                  setSaved(true);
                } catch (err) {
                  setError(errorText(err));
                } finally {
                  setSaving(false);
                }
              }}
            >
              <div className="max-lg:sr-only">
                <h2 id="profile-h" className="font-display text-lg font-bold">
                  Profile card
                </h2>
                <p className="text-[13px] text-dim">What strangers see next to your country.</p>
              </div>
              <ProfileEditor settings={settings} onChange={update} />
              {error && <Alert>{error}</Alert>}
              {saved && <Note>Saved{user ? ' to your account' : ' in this browser'}.</Note>}
              <button type="submit" disabled={saving} className={`${primary} mt-1`}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              {!user && (
                <p className="text-[13px] text-dim">
                  Settings are saved in this browser.{' '}
                  <Link href="/signup" className="font-medium text-lime hover:underline">
                    Create an account
                  </Link>{' '}
                  to keep them on every device.
                </p>
              )}
            </form>
          </section>

          <section id="privacy" aria-labelledby="privacy-h" className={`flex scroll-mt-6 flex-col gap-4 ${onPhone('privacy')}`}>
            <PhoneBack title="Privacy & blocks" onBack={() => go('main')} />
            <div className={`${card} flex flex-col gap-3 p-4 lg:p-[22px]`}>
              <h2 id="privacy-h" className="font-display text-lg font-bold">
                Blocked people
              </h2>
              <p className="text-[13px] text-dim">Blocks are saved on this device. Unblock someone to let them be matched with you again.</p>
              <BlockedList />
            </div>
            <div className={`${card} flex flex-col gap-2 p-4 lg:p-[22px]`}>
              <h2 className="font-display text-lg font-bold">Privacy</h2>
              <p className="text-[13px] leading-relaxed text-mute">
                randomCall uses no advertising or analytics cookies. Your browser stores only what the app needs: a random device id (for
                safety tools like blocks and bans), your settings, and your login session. Read the{' '}
                <Link href="/privacy" className="text-lime underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </section>
        </div>

        {/* Right column: switches, account */}
        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <section id="chat" aria-labelledby="chat-h" className={`${card} scroll-mt-6 lg:flex lg:flex-col lg:gap-3.5 lg:p-[22px] ${onPhone('main')}`}>
            <h2 id="chat-h" className="font-display text-lg font-bold max-lg:sr-only">
              {user ? 'Chat & notifications' : 'Chat'}
            </h2>
            <div className="divide-y divide-divider lg:flex lg:flex-col lg:gap-3.5 lg:divide-y-0">
              <SwitchRow
                checked={settings.allowReconnect}
                onChange={(v) => void saveToggle({ allowReconnect: v })}
                title="Allow reconnect"
                detail="People you skip can press Back to reach you again"
              />
              <SwitchRow
                checked={settings.hideCountry}
                onChange={(v) => void saveToggle({ hideCountry: v })}
                title="Hide my country"
                detail="Partners see “Location hidden” instead of your flag"
              />
              {user && token && (
                <>
                  <SwitchRow
                    checked={user.emailsOn}
                    disabled={emailsBusy}
                    onChange={async (on) => {
                      setEmailsBusy(true);
                      await api('/auth/emails', { optOut: !on }, token).catch(() => undefined);
                      await refresh().catch(() => undefined);
                      setEmailsBusy(false);
                    }}
                    title="Away emails"
                    detail="At most one every two weeks: who's online and your daily reward"
                  />
                  <div className="flex flex-col gap-2 px-3.5 py-3 lg:px-0 lg:py-0">
                    <div>
                      <div className="text-sm font-semibold lg:text-[15px]">Push notifications</div>
                      <div className="text-xs text-dim lg:text-[13px]">When a friend comes online, your badge is approved or an invite pays off</div>
                    </div>
                    <div className="[&_button]:h-11 [&_button]:rounded-xl [&_button]:border [&_button]:border-line-2 [&_button]:bg-card-2 [&_button]:px-3.5 [&_button]:text-[13px] [&_button]:font-medium [&_button]:text-[#e6e8ec] [&_p]:text-[13px] [&_p]:text-dim">
                      <NotificationsToggle />
                    </div>
                  </div>
                </>
              )}
              <InstallButton className="px-3.5 py-3 lg:px-0 lg:py-0 [&_p]:text-[13px] [&_p]:text-mute" />
            </div>
            {toggleError && (
              <div className="p-3.5 lg:p-0">
                <Alert>{toggleError}</Alert>
              </div>
            )}
          </section>

          {user && token ? (
            <>
              {/* Phone list card (main view) */}
              <nav aria-label="More settings" className={`${card} divide-y divide-divider overflow-hidden lg:hidden ${view === 'main' ? '' : 'hidden'}`}>
                <Link href="/plus" className="flex min-h-14 items-center justify-between gap-3 px-3.5 py-3 text-sm">
                  <span className="min-w-0">
                    Plus
                    <span className={`block text-xs ${user.plus.active ? 'text-gold' : 'text-dim'}`}>{plusText(user)}</span>
                  </span>
                  <span className="flex-none text-faint">{user.plus.active ? 'Manage ›' : 'See plans ›'}</span>
                </Link>
                {user.verification === 'verified' || user.verification === 'pending' ? (
                  <div className="flex min-h-14 items-center px-3.5 py-3 text-sm">
                    <span>
                      Verified badge
                      <span className="block text-xs text-dim">{badgeText(user)}</span>
                    </span>
                  </div>
                ) : (
                  <Link href="/get-verified" className="flex min-h-14 items-center justify-between gap-3 px-3.5 py-3 text-sm">
                    <span className="min-w-0">
                      Verified badge
                      <span className="block text-xs text-dim">{badgeText(user)}</span>
                    </span>
                    <Chevron />
                  </Link>
                )}
                <button type="button" onClick={() => go('account')} className="flex min-h-14 w-full items-center justify-between gap-3 px-3.5 py-3 text-left text-sm">
                  <span className="min-w-0">
                    Account
                    <span className="block truncate text-xs text-dim">{user.email}</span>
                  </span>
                  <Chevron />
                </button>
                <Link href="/invite" className="flex min-h-14 items-center justify-between gap-3 px-3.5 py-3 text-sm">
                  <span className="min-w-0">
                    Invite friends
                    <span className="block text-xs text-dim">You both get a free day of Plus</span>
                  </span>
                  <Chevron />
                </Link>
                <button type="button" onClick={() => go('privacy')} className="flex min-h-14 w-full items-center justify-between gap-3 px-3.5 py-3 text-left text-sm">
                  Privacy &amp; blocked people
                  <Chevron />
                </button>
              </nav>

              <section id="account" aria-labelledby="account-h" className={`flex scroll-mt-6 flex-col gap-4 ${onPhone('account')}`}>
                <PhoneBack title="Account" onBack={() => go('main')} />
                <AccountCard
                  user={user}
                  token={token}
                  onLogout={() => void logOut()}
                  onDeleted={() => {
                    forget();
                    router.push('/');
                  }}
                />
              </section>

              <button
                type="button"
                onClick={() => void logOut()}
                className={`h-11 rounded-xl border border-stop text-sm font-semibold text-stop-text lg:hidden ${view === 'main' ? '' : 'hidden'}`}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <nav aria-label="More settings" className={`${card} overflow-hidden lg:hidden ${view === 'main' ? '' : 'hidden'}`}>
                <button type="button" onClick={() => go('privacy')} className="flex min-h-14 w-full items-center justify-between gap-3 px-3.5 py-3 text-left text-sm">
                  Privacy &amp; blocked people
                  <Chevron />
                </button>
              </nav>
              <section className={`${card} flex flex-col gap-3 p-4 lg:p-[22px] ${onPhone('main')}`}>
                <h2 className="font-display text-lg font-bold">Keep your settings</h2>
                <p className="text-[13px] text-mute">Settings are saved in this browser. Create a free account to keep them on every device.</p>
                <div className="flex flex-wrap gap-2">
                  <Link href="/signup" className="inline-flex h-11 items-center rounded-xl bg-lime px-4 font-display text-[15px] font-bold text-[#0b0d10] hover:bg-lime-hover">
                    Create an account
                  </Link>
                  <Link href="/login" className={pill}>
                    Log in
                  </Link>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}

function AccountCard({ user, token, onLogout, onDeleted }: { user: PublicUser; token: string; onLogout: () => void; onDeleted: () => void }) {
  const [open, setOpen] = useState<'password' | 'delete' | null>(null);
  const row = 'flex flex-wrap items-center justify-between gap-x-4 gap-y-2';
  const caption = 'text-[13px] text-dim';
  return (
    <div className={`${card} flex flex-col gap-4 p-4 lg:p-[22px]`}>
      <h2 id="account-h" className="sr-only">
        Account
      </h2>
      <div className={row}>
        <div className="min-w-0">
          <div className={caption}>Account</div>
          <div className="break-all font-semibold">
            {user.email}{' '}
            {user.emailVerified ? <span className="text-[11px] font-semibold text-lime">confirmed</span> : <ResendVerification token={token} />}
          </div>
          <div className="text-xs text-faint">Member since {new Date(user.createdAt).toLocaleDateString()}</div>
        </div>
        <button type="button" onClick={onLogout} className={`${pill} max-lg:hidden`}>
          Log out
        </button>
      </div>

      <div id="plus" className={`${row} scroll-mt-6`}>
        <div className="min-w-0">
          <div className={caption}>Plus</div>
          <div className={`font-semibold ${user.plus.active ? 'text-gold' : 'text-mute'}`}>{plusText(user)}</div>
        </div>
        <Link href="/plus" className={pill}>
          {user.plus.active ? 'Manage' : 'See Plus plans'}
        </Link>
      </div>

      <div className={row}>
        <div className="min-w-0">
          <div className={caption}>Verified badge</div>
          <div className="font-semibold">{badgeText(user)}</div>
        </div>
        {user.verification !== 'verified' && user.verification !== 'pending' && (
          <Link href="/get-verified" className={pill}>
            Get verified
          </Link>
        )}
      </div>

      <div className={`${row} max-lg:hidden`}>
        <div className="min-w-0">
          <div className={caption}>Invite friends</div>
          <div className="font-semibold">You and each friend who joins get a free day of Plus</div>
        </div>
        <Link href="/invite" className={pill}>
          Get your link
        </Link>
      </div>

      <div className="flex flex-wrap justify-between gap-2">
        <button type="button" aria-expanded={open === 'password'} onClick={() => setOpen(open === 'password' ? null : 'password')} className={pill}>
          Change password
        </button>
        <button
          type="button"
          aria-expanded={open === 'delete'}
          onClick={() => setOpen(open === 'delete' ? null : 'delete')}
          className={`${pill} border-stop text-stop-text hover:border-[#5a2a2a]`}
        >
          Delete account
        </button>
      </div>
      {open === 'password' && <ChangePassword token={token} />}
      {open === 'delete' && <DeleteAccount token={token} onDeleted={onDeleted} />}
    </div>
  );
}

function ResendVerification({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'sent' | 'error'>('idle');
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 text-[11px] font-normal">
      <span className="font-semibold text-gold">not confirmed</span>
      {state === 'sent' ? (
        <span className="text-dim">Link sent — check your inbox.</span>
      ) : (
        <button
          type="button"
          className="min-h-8 text-lime underline"
          onClick={() =>
            api('/auth/resend-verification', {}, token)
              .then(() => setState('sent'))
              .catch(() => setState('error'))
          }
        >
          {state === 'error' ? 'Could not send — retry' : 'Resend confirmation email'}
        </button>
      )}
    </span>
  );
}

function ChangePassword({ token }: { token: string }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      aria-label="Change password"
      className="flex flex-col gap-3 border-t border-divider pt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        setDone(false);
        try {
          await api('/auth/password', { current, next }, token);
          setDone(true);
          setCurrent('');
          setNext('');
        } catch (err) {
          setError(errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="current" className={label}>
        Current password
        <input id="current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={input} />
      </label>
      <label htmlFor="next" className={label}>
        New password (at least {MIN_PASSWORD_LENGTH} characters)
        <input
          id="next"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className={input}
        />
      </label>
      {error && <Alert>{error}</Alert>}
      {done && <Note>Password changed.</Note>}
      <button type="submit" disabled={busy} className={primary}>
        {busy ? 'Please wait…' : 'Change password'}
      </button>
    </form>
  );
}

function DeleteAccount({ token, onDeleted }: { token: string; onDeleted: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      aria-label="Delete account"
      className="flex flex-col gap-3 border-t border-divider pt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api('/auth/delete', { password }, token);
          onDeleted();
        } catch (err) {
          setError(errorText(err));
          setBusy(false);
        }
      }}
    >
      <p className="text-[13px] text-mute">Permanently deletes your account and saved settings. This cannot be undone.</p>
      <label htmlFor="delete-password" className={label}>
        Enter your password to confirm
        <input
          id="delete-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
        />
      </label>
      {error && <Alert>{error}</Alert>}
      <button type="submit" disabled={busy} className="h-12 rounded-xl bg-[#d93a2f] text-[15px] font-semibold text-white hover:bg-[#c23026] disabled:opacity-50">
        {busy ? 'Deleting…' : 'Permanently delete account'}
      </button>
    </form>
  );
}
