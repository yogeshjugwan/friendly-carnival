'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { MIN_PASSWORD_LENGTH, type PublicUser, type UserSettings } from '@rc/shared';
import { AppShell } from '@/components/AppShell';
import { errorText } from '@/components/forms/fields';
import { api, useAuth } from '@/lib/auth';
import { LANGS, useI18n, type Lang } from '@/lib/i18n';
import { loadSettings } from '@/lib/settings';
import { BlockedList } from '@/components/BlockedList';
import { NotificationsToggle, useInstall } from '@/components/Pwa';
import { ProfileAvatar, ProfileEditor, profilePreview } from '@/components/ProfileEditor';

/** Phones show one view at a time (the "Me" tab and its sub-pages); desktop shows every card in two columns. */
type View = 'main' | 'profile' | 'account' | 'privacy';

const card = 'flex flex-col gap-3.5 rounded-[18px] border border-line bg-card p-4 lg:rounded-[20px] lg:p-5';
/** Phone list group (MeMobile `.grp`). */
const group = 'overflow-hidden rounded-2xl border border-line bg-card';
const input =
  'h-[46px] w-full min-w-0 rounded-xl border border-line-2 bg-[#120D18] px-3.5 text-[15px] text-[#f4f5f7] outline-none placeholder:text-faint focus:border-lime';
const label = 'flex flex-col gap-1.5 text-[13px] text-mute';
const ghost =
  'inline-flex h-11 flex-none items-center justify-center rounded-xl border border-line-2 bg-transparent px-4 text-sm font-semibold text-[#e6e8ec] hover:border-[#4a3f5c] disabled:opacity-50';
const primary =
  'h-[54px] w-full rounded-[14px] bg-lime font-display text-[17px] font-bold text-night disabled:opacity-50 lg:h-[46px] lg:w-auto lg:self-end lg:rounded-xl lg:px-6 lg:text-[15px]';
const cardTitle = 'm-0 font-display text-[17px] font-bold';
/** Desktop card row (top divider) / phone list row (bottom divider). */
const row =
  'flex min-h-12 items-center justify-between gap-3 border-b border-card-2 px-3.5 py-2 last:border-b-0 lg:min-h-[52px] lg:border-b-0 lg:border-t lg:px-0 lg:pb-0 lg:pt-3';
const listRow = 'flex min-h-12 w-full items-center justify-between gap-2.5 border-b border-card-2 px-3.5 py-2 text-left text-[15px] text-[#f4f5f7] last:border-b-0';

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="m-0 rounded-xl border border-[#4a2424] bg-[#2a1616] px-3 py-2 text-sm text-stop-text">
      {children}
    </p>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="m-0 rounded-xl border border-lime bg-pick px-3 py-2 text-sm text-lime">
      {children}
    </p>
  );
}

/** A labelled on/off switch: 52×32 track, gradient when on. */
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
    <div className={row}>
      <span className="min-w-0">
        <span id={`${id}-t`} className="block text-[15px]">
          {title}
        </span>
        {detail && (
          <span id={`${id}-d`} className="text-xs text-mute lg:text-[13px]">
            {detail}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-t`}
        aria-describedby={detail ? `${id}-d` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`flex h-8 w-[52px] flex-none rounded-full p-[3px] transition-colors disabled:opacity-50 ${checked ? 'justify-end bg-lime' : 'justify-start bg-line-2'}`}
      >
        <span className={`h-[26px] w-[26px] rounded-full ${checked ? 'bg-[#0b0d10]' : 'bg-[#8a8f99]'}`} />
      </button>
    </div>
  );
}

/** Phone sub-view header: back arrow + title. */
function PhoneBack({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 lg:hidden">
      <button type="button" aria-label="Back to settings" onClick={onBack} className="grid h-11 w-11 place-items-center rounded-full text-[#f4f5f7]">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <h2 className="m-0 font-display text-[22px] font-bold">{title}</h2>
    </div>
  );
}

const plusText = (user: PublicUser) =>
  user.plus.active
    ? `Active${user.plus.until ? ` until ${new Date(user.plus.until).toLocaleDateString()}` : ''}${user.plus.cancelAtPeriodEnd ? ' · will not renew' : ''}`
    : 'Not active · unlock filters & more';

const badgeText = (user: PublicUser) =>
  user.verification === 'verified'
    ? 'Partners see the blue badge'
    : user.verification === 'pending'
      ? 'Selfie under review'
      : 'Show strangers you are a real person';

function BadgePill({ user }: { user: PublicUser }) {
  if (user.verification === 'verified') {
    return <span className="flex h-7 flex-none items-center rounded-full bg-pick px-2.5 text-xs font-semibold text-lime">Verified</span>;
  }
  if (user.verification === 'pending') {
    return <span className="flex h-7 flex-none items-center rounded-full bg-gold-bg px-2.5 text-xs font-semibold text-gold">Pending</span>;
  }
  return (
    <Link href="/get-verified" className={ghost}>
      Get verified
    </Link>
  );
}

/** "Install app — Add to home screen" (hidden when installed or not installable). */
function InstallRow() {
  const { state, install } = useInstall();
  const [help, setHelp] = useState(false);
  if (state === 'hidden') return null;
  return (
    <>
      <button type="button" onClick={() => (state === 'prompt' ? void install() : setHelp(!help))} aria-expanded={state === 'ios' ? help : undefined} className={listRow}>
        <span>Install app</span>
        <span className="text-[13px] text-lime">Add to home screen ›</span>
      </button>
      {help && <p className="m-0 border-b border-card-2 px-3.5 py-2 text-[13px] text-mute">Tap Share, then Add to Home Screen.</p>}
    </>
  );
}

function LanguageSelect({ id, className }: { id: string; className: string }) {
  const { lang, setLang } = useI18n();
  return (
    <select id={id} value={lang} onChange={(e) => setLang(e.target.value as Lang)} className={className}>
      {LANGS.map((l) => (
        <option key={l.code} value={l.code}>
          {l.name}
        </option>
      ))}
    </select>
  );
}

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
  const [deleting, setDeleting] = useState(false);

  // Load once: later `user` updates (after a toggle saves, or emails/verification refresh) must not wipe unsaved profile edits.
  useEffect(() => {
    if (loading || settings) return;
    setSettings(user?.settings ?? loadSettings());
    setWelcome(new URLSearchParams(window.location.search).has('welcome'));
  }, [loading, user, settings]);

  if (!settings) {
    return (
      <AppShell title="Settings">
        <p className="text-sm text-mute">Loading…</p>
      </AppShell>
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

  /** Phone: show only on view `v`; desktop: always. */
  const onPhone = (v: View) => (view === v ? '' : 'max-lg:hidden');
  const phoneMain = `lg:hidden ${view === 'main' ? '' : 'hidden'}`;
  const signedIn = user && token ? { user, token } : null;

  return (
    <AppShell title="Settings">
      {welcome && user && <Note>Welcome! We sent a confirmation link to {user.email}.</Note>}

      <div className="grid min-w-0 items-start gap-3 lg:grid-cols-2 lg:gap-4">
        {/* Left column */}
        <div className="flex min-w-0 flex-col gap-3 lg:gap-4">
          {/* Phone "Me": profile row */}
          <div className={`flex items-center gap-3 ${phoneMain}`}>
            <ProfileAvatar settings={settings} size="sm" />
            <div className="min-w-0 flex-1">
              <strong className="block truncate font-display text-lg font-bold">{settings.name?.trim() || (user ? user.email.split('@')[0] : 'Guest')}</strong>
              <p className="m-0 mt-0.5 truncate text-xs text-mute">Partners see: {profilePreview(settings)}</p>
            </div>
            <button type="button" onClick={() => go('profile')} className="flex h-11 flex-none items-center rounded-xl border border-line-2 px-3.5 text-[13px] font-semibold text-[#e6e8ec]">
              Edit
            </button>
          </div>

          {/* Phone "Me": Plus banner */}
          <Link href="/plus" className={`flex items-center justify-between gap-3 rounded-2xl border border-[#4a3f17] bg-gold-bg p-3.5 text-gold ${phoneMain}`}>
            <span className="min-w-0">
              <strong className="block font-display text-[15px] font-bold">{user?.plus.active ? 'Plus active' : 'Get Plus'}</strong>
              <span className="block text-xs text-[#cdb766]">{user?.plus.active ? plusText(user) : 'Gender & country filters, unlimited matches'}</span>
            </span>
            <span className="flex-none text-[13px]">{user?.plus.active ? 'Manage ›' : 'Upgrade ›'}</span>
          </Link>

          <section id="profile" aria-labelledby="profile-h" className={`flex scroll-mt-6 flex-col gap-3.5 ${onPhone('profile')}`}>
            <PhoneBack title="Edit profile" onBack={() => go('main')} />
            <form
              className="flex flex-col gap-3.5 lg:rounded-[20px] lg:border lg:border-line lg:bg-card lg:p-5"
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
              <h2 id="profile-h" className="sr-only">
                Profile
              </h2>
              <ProfileEditor settings={settings} onChange={update} />
              {error && <Alert>{error}</Alert>}
              {saved && <Note>Saved{user ? ' to your account' : ' in this browser'}.</Note>}
              <button type="submit" disabled={saving} className={`${primary} mt-1`}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              {!user && (
                <p className="m-0 text-[13px] text-mute">
                  Settings are saved in this browser.{' '}
                  <Link href="/signup" className="font-medium text-lime hover:underline">
                    Create an account
                  </Link>{' '}
                  to keep them on every device.
                </p>
              )}
            </form>
          </section>

          <section aria-labelledby="lang-h" className={`${card} max-lg:hidden`}>
            <h2 id="lang-h" className={cardTitle}>
              Language
            </h2>
            <label htmlFor="app-lang" className={label}>
              App language
              <LanguageSelect id="app-lang" className={input} />
            </label>
          </section>

          <section id="privacy" aria-labelledby="privacy-h" className={`flex scroll-mt-6 flex-col gap-3.5 ${onPhone('privacy')}`}>
            <PhoneBack title="Privacy & blocks" onBack={() => go('main')} />
            <div className={card}>
              <h2 id="privacy-h" className={cardTitle}>
                Blocked people
              </h2>
              <p className="m-0 text-[13px] text-mute">Blocks are saved on this device. Unblock someone to let them be matched with you again.</p>
              <BlockedList />
            </div>
            <div className={card}>
              <h2 className={cardTitle}>Privacy</h2>
              <p className="m-0 text-[13px] leading-relaxed text-mute">
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

        {/* Right column */}
        <div className="flex min-w-0 flex-col gap-3 lg:gap-4">
          <section aria-labelledby="chat-h" className={`${group} lg:flex lg:flex-col lg:gap-3.5 lg:rounded-[20px] lg:p-5 ${onPhone('main')}`}>
            <h2 id="chat-h" className={`${cardTitle} max-lg:sr-only`}>
              Chat
            </h2>
            <SwitchRow
              checked={settings.allowReconnect}
              onChange={(v) => void saveToggle({ allowReconnect: v })}
              title="Allow reconnect"
              detail="People you skip can press Back"
            />
            <SwitchRow
              checked={settings.hideCountry}
              onChange={(v) => void saveToggle({ hideCountry: v })}
              title="Hide my country"
              detail="Partners see “Location hidden”"
            />
            <SwitchRow
              checked={!!settings.safetyBlur}
              onChange={(v) => void saveToggle({ safetyBlur: v })}
              title="Blur flagged video"
              detail="Blur video that may show nudity, and new users' video, until you tap to reveal"
            />
            {signedIn && (
              <>
                <SwitchRow
                  checked={signedIn.user.emailsOn}
                  disabled={emailsBusy}
                  onChange={async (on) => {
                    setEmailsBusy(true);
                    await api('/auth/emails', { optOut: !on }, signedIn.token).catch(() => undefined);
                    await refresh().catch(() => undefined);
                    setEmailsBusy(false);
                  }}
                  title="Away emails"
                  detail="At most once every 2 weeks"
                />
                <div className={`${row} flex-wrap`}>
                  <span className="min-w-0">
                    <span className="block text-[15px]">Push notifications</span>
                    <span className="text-xs text-mute lg:text-[13px]">When a friend comes online or your badge is approved</span>
                  </span>
                  <div className="[&_button]:h-11 [&_button]:rounded-xl [&_button]:border [&_button]:border-line-2 [&_button]:bg-transparent [&_button]:px-4 [&_button]:text-sm [&_button]:font-semibold [&_button]:text-[#e6e8ec] [&_p]:text-[13px] [&_p]:text-mute">
                    <NotificationsToggle />
                  </div>
                </div>
              </>
            )}
            {toggleError && (
              <div className="p-3.5 lg:p-0">
                <Alert>{toggleError}</Alert>
              </div>
            )}
          </section>

          {signedIn && (
            <section aria-label="Plus and verification" className={`${card} max-lg:hidden`}>
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <strong className={`${cardTitle} block text-gold`}>Plus</strong>
                  <span className="block text-[13px] text-mute">{plusText(signedIn.user)}</span>
                </span>
                <Link href="/plus" className={`${ghost} border-[#4a3f17] text-gold hover:border-gold`}>
                  {signedIn.user.plus.active ? 'Manage' : 'Get Plus'}
                </Link>
              </div>
              <div className={row}>
                <span className="min-w-0">
                  <span className="block text-[15px]">Verified badge</span>
                  <span className="text-[13px] text-mute">{badgeText(signedIn.user)}</span>
                </span>
                <BadgePill user={signedIn.user} />
              </div>
            </section>
          )}

          {/* Phone "Me": list of links */}
          <nav aria-label="More settings" className={`${group} ${phoneMain}`}>
            <InstallRow />
            <label htmlFor="app-lang-phone" className={`${listRow} relative`}>
              <span>Language</span>
              <span className="flex items-center text-[13px] text-mute">
                <LanguageSelect id="app-lang-phone" className="h-11 max-w-[150px] cursor-pointer appearance-none bg-transparent text-right text-[13px] text-mute outline-none" />
                <span aria-hidden className="ml-1">
                  ›
                </span>
              </span>
            </label>
            <Link href="/invite" className={listRow}>
              <span>Invite friends</span>
              <span className="text-[13px] text-lime">Free Plus ›</span>
            </Link>
            {signedIn && (
              <>
                {signedIn.user.verification === 'verified' || signedIn.user.verification === 'pending' ? (
                  <div className={listRow}>
                    <span>Verified badge</span>
                    <span className={`text-[13px] ${signedIn.user.verification === 'verified' ? 'text-lime' : 'text-gold'}`}>
                      {signedIn.user.verification === 'verified' ? 'Verified' : 'Pending'}
                    </span>
                  </div>
                ) : (
                  <Link href="/get-verified" className={listRow}>
                    <span>Verified badge</span>
                    <span className="text-[13px] text-gold">Get verified ›</span>
                  </Link>
                )}
                <button type="button" onClick={() => go('account')} className={listRow}>
                  <span>Account</span>
                  <span className="text-faint" aria-hidden>
                    ›
                  </span>
                </button>
              </>
            )}
            <button type="button" onClick={() => go('privacy')} className={listRow}>
              <span>Privacy &amp; blocked people</span>
              <span className="text-faint" aria-hidden>
                ›
              </span>
            </button>
            <Link href="/help" className={listRow}>
              <span>Help &amp; support</span>
              <span className="text-faint" aria-hidden>
                ›
              </span>
            </Link>
            {signedIn ? (
              <button type="button" onClick={() => void logOut()} className={`${listRow} text-stop-text`}>
                Log out
              </button>
            ) : (
              <Link href="/login" className={`${listRow} text-lime`}>
                Log in
              </Link>
            )}
          </nav>

          {signedIn ? (
            <section id="account" aria-labelledby="account-h" className={`flex scroll-mt-6 flex-col gap-3.5 ${onPhone('account')}`}>
              <PhoneBack title="Account" onBack={() => go('main')} />
              <AccountCard user={signedIn.user} token={signedIn.token} onLogout={() => void logOut()} onDelete={() => setDeleting(true)} />
            </section>
          ) : (
            <section aria-labelledby="keep-h" className={`${card} ${onPhone('main')}`}>
              <h2 id="keep-h" className={cardTitle}>
                Keep your settings
              </h2>
              <p className="m-0 text-[13px] text-mute">Settings are saved in this browser. Create a free account to keep them on every device.</p>
              <div className="flex flex-wrap gap-2">
                <Link href="/signup" className="inline-flex h-11 items-center rounded-xl bg-lime px-4 font-display text-[15px] font-bold text-night">
                  Create an account
                </Link>
                <Link href="/login" className={ghost}>
                  Log in
                </Link>
              </div>
            </section>
          )}
        </div>
      </div>

      {signedIn && deleting && (
        <DeleteDialog
          token={signedIn.token}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            forget();
            router.push('/');
          }}
        />
      )}
    </AppShell>
  );
}

function AccountCard({ user, token, onLogout, onDelete }: { user: PublicUser; token: string; onLogout: () => void; onDelete: () => void }) {
  const [changing, setChanging] = useState(false);
  return (
    <div className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-0">
          <h2 id="account-h" className={`${cardTitle} block`}>
            Account
          </h2>
          <span className="block break-all text-[13px] text-mute">
            {user.email} · {user.emailVerified ? 'confirmed' : <span className="text-gold">not confirmed</span>}
          </span>
          <span className="block text-xs text-faint">Member since {new Date(user.createdAt).toLocaleDateString()}</span>
        </span>
        <button type="button" aria-expanded={changing} onClick={() => setChanging(!changing)} className={ghost}>
          Change password
        </button>
      </div>
      {!user.emailVerified && <ResendVerification token={token} />}
      {changing && <ChangePassword token={token} />}

      {/* Phone: Plus & badge live on the Me list, so repeat them here only as text rows */}
      <div className={`${row} lg:hidden`}>
        <span className="min-w-0">
          <span className="block text-[15px] text-gold">Plus</span>
          <span className="text-xs text-mute">{plusText(user)}</span>
        </span>
        <Link href="/plus" className={`${ghost} border-[#4a3f17] text-gold`}>
          {user.plus.active ? 'Manage' : 'Get Plus'}
        </Link>
      </div>

      <div className={`${row} flex-wrap`}>
        <a href="#privacy" className="text-[15px] text-[#e6e8ec] underline max-lg:hidden">
          Privacy &amp; blocked people
        </a>
        <span className="flex flex-wrap gap-2">
          <button type="button" onClick={onLogout} className={`${ghost} max-lg:hidden`}>
            Log out
          </button>
          <button type="button" onClick={onDelete} className={`${ghost} border-[#4a2424] text-stop-text hover:border-stop-text`}>
            Delete account
          </button>
        </span>
      </div>
    </div>
  );
}

function ResendVerification({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'sent' | 'error'>('idle');
  if (state === 'sent') return <p className="m-0 text-[13px] text-mute">Link sent — check your inbox.</p>;
  return (
    <button
      type="button"
      className="min-h-11 self-start text-sm font-semibold text-lime underline"
      onClick={() =>
        api('/auth/resend-verification', {}, token)
          .then(() => setState('sent'))
          .catch(() => setState('error'))
      }
    >
      {state === 'error' ? 'Could not send — retry' : 'Resend confirmation email'}
    </button>
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
      className="flex flex-col gap-3 border-t border-card-2 pt-3"
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

/** "Delete your account?" dialog; the server needs the password to confirm. */
function DeleteDialog({ token, onClose, onDeleted }: { token: string; onClose: () => void; onDeleted: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div aria-hidden className="absolute inset-0 bg-[rgba(11,8,17,.72)]" onClick={onClose} />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-h"
        className="relative flex w-[440px] max-w-full flex-col gap-3.5 rounded-[22px] border border-divider bg-card p-6 shadow-[0_30px_80px_rgba(0,0,0,.6)]"
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
        <h2 id="delete-h" className="m-0 font-display text-xl font-bold text-stop-text">
          Delete your account?
        </h2>
        <ul className="m-0 list-disc pl-[18px] text-sm leading-relaxed text-[#c9cdd4]">
          <li>Your account, profile and saved settings are removed</li>
          <li>Unused coins and Plus time are lost</li>
          <li>This cannot be undone</li>
        </ul>
        <label htmlFor="delete-password" className={label}>
          Enter your password to confirm
          <input
            id="delete-password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${input} bg-night`}
          />
        </label>
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2.5">
          <button type="button" onClick={onClose} className="h-[50px] flex-1 rounded-[14px] border-[1.5px] border-[#4a3f5c] text-[15px] font-semibold text-[#e6e8ec]">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="h-[50px] flex-[1.3] rounded-[14px] bg-[#ff5a5a] font-display text-[15px] font-bold text-white disabled:opacity-50">
            {busy ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </form>
    </div>
  );
}
