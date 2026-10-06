'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MAX_INTERESTS, MIN_PASSWORD_LENGTH, type Gender, type UserSettings } from '@rc/shared';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { errorText, Field, FormError, FormNote, Submit } from '@/components/forms/fields';
import { api, useAuth } from '@/lib/auth';
import { loadSettings } from '@/lib/settings';
import { BlockedList } from '@/components/BlockedList';
import { InstallButton, NotificationsToggle } from '@/components/Pwa';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 text-ink shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Toggle({ checked, onChange, title, detail }: { checked: boolean; onChange: (v: boolean) => void; title: string; detail: string }) {
  return (
    <label className="mt-4 flex items-start gap-3 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4" />
      <span>
        <span className="font-medium">{title}</span>
        <span className="block text-slate-500">{detail}</span>
      </span>
    </label>
  );
}

export default function SettingsPage() {
  const { user, token, loading, saveSettings, logout, forget } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [interestText, setInterestText] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [welcome, setWelcome] = useState(false);

  useEffect(() => {
    if (loading) return;
    const s = user?.settings ?? loadSettings();
    setSettings(s);
    setInterestText(s.interests.join(', '));
    setWelcome(new URLSearchParams(window.location.search).has('welcome'));
  }, [loading, user]);

  if (!settings) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <SiteHeader />
      </main>
    );
  }

  const update = (patch: Partial<UserSettings>) => {
    setSettings({ ...settings, ...patch });
    setSaved(false);
  };

  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
      <SiteHeader />
      <h1 className="mt-4 text-3xl font-bold">Settings</h1>
      {welcome && user && <FormNote>Welcome! We sent a confirmation link to {user.email}.</FormNote>}

      <Section title="Chat preferences">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            setError(null);
            const interests = interestText
              .split(',')
              .map((i) => i.trim().toLowerCase())
              .filter(Boolean)
              .slice(0, MAX_INTERESTS);
            try {
              await saveSettings({ ...settings, interests });
              setSettings({ ...settings, interests });
              setSaved(true);
            } catch (err) {
              setError(errorText(err));
            } finally {
              setSaving(false);
            }
          }}
        >
          <label className="mt-4 block text-sm" htmlFor="gender">
            <span className="font-medium text-slate-600">I am</span>
            <select
              id="gender"
              value={settings.gender ?? ''}
              onChange={(e) => update({ gender: (e.target.value || null) as Gender | null })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"
            >
              <option value="">Choose each time</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="couple">We are a couple</option>
            </select>
          </label>
          <Field
            id="interests"
            label="Interests (comma separated, up to 10)"
            value={interestText}
            onChange={(e) => (setInterestText(e.target.value), setSaved(false))}
            placeholder="music, travel, cricket"
          />
          <Toggle
            checked={settings.allowReconnect}
            onChange={(v) => update({ allowReconnect: v })}
            title="Allow reconnect"
            detail="People you skip can press Back to reach you again."
          />
          <Toggle
            checked={settings.hideCountry}
            onChange={(v) => update({ hideCountry: v })}
            title="Hide my country"
            detail="Partners see “Location hidden” instead of your flag."
          />
          <FormError error={error} />
          {saved && <FormNote>Saved{user ? ' to your account' : ' in this browser'}.</FormNote>}
          <Submit busy={saving}>Save preferences</Submit>
          {!user && (
            <p className="mt-3 text-sm text-slate-500">
              Settings are saved in this browser.{' '}
              <Link href="/signup" className="font-medium text-brand">
                Create an account
              </Link>{' '}
              to keep them on every device.
            </p>
          )}
        </form>
      </Section>

      {user && token && (
        <>
          <Section title="Account">
            <p className="mt-3 text-sm">
              {user.email}{' '}
              {user.emailVerified ? (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">confirmed</span>
              ) : (
                <ResendVerification token={token} />
              )}
            </p>
            <p className="mt-1 text-xs text-slate-500">Member since {new Date(user.createdAt).toLocaleDateString()}</p>
            <button
              onClick={async () => {
                await logout();
                router.push('/');
              }}
              className="mt-4 rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-300"
            >
              Log out
            </button>
          </Section>
          <Section title="Notifications & app">
            <p className="mt-3 text-sm text-slate-600">Get a notification when a friend comes online, your badge is approved or an invite pays off.</p>
            <div className="mt-3 flex flex-wrap items-start gap-3">
              <NotificationsToggle />
              <InstallButton className="[&_button]:bg-slate-800 [&_p]:text-slate-600" />
            </div>
          </Section>
          <Section title="Invite friends">
            <p className="mt-3 text-sm text-slate-600">
              You and each friend who joins with your link get a free day of Plus.{' '}
              <Link href="/invite" className="font-medium text-brand">
                Get your link
              </Link>
            </p>
          </Section>
          <Section title="Verified badge">
            <p className="mt-3 text-sm text-slate-600">
              {user.verification === 'verified'
                ? '✓ You are verified — partners see the blue badge.'
                : user.verification === 'pending'
                  ? '⏳ Your selfie is being reviewed.'
                  : 'Show strangers you are a real person with a quick selfie.'}{' '}
              {user.verification !== 'verified' && user.verification !== 'pending' && (
                <Link href="/get-verified" className="font-medium text-brand">
                  Get verified
                </Link>
              )}
            </p>
          </Section>
          <Section title="Plus">
            {user.plus.active ? (
              <p className="mt-3 text-sm">
                👑 Active{user.plus.until ? ` until ${new Date(user.plus.until).toLocaleDateString()}` : ''}
                {user.plus.cancelAtPeriodEnd ? ' (will not renew)' : ''}.{' '}
                <Link href="/plus" className="font-medium text-brand">
                  Manage
                </Link>
              </p>
            ) : (
              <p className="mt-3 text-sm text-slate-600">
                Unlock gender and country filters and remove ads.{' '}
                <Link href="/plus" className="font-medium text-brand">
                  See Plus plans
                </Link>
              </p>
            )}
          </Section>
          <ChangePassword token={token} />
          <DeleteAccount
            token={token}
            onDeleted={() => {
              forget();
              router.push('/');
            }}
          />
        </>
      )}

      <Section title="Blocked people">
        <p className="mb-2 mt-1 text-sm text-slate-500">Blocks are saved on this device. Unblock someone to let them be matched with you again.</p>
        <BlockedList />
      </Section>

      <Section title="Privacy">
        <p className="mt-3 text-sm text-slate-600">
          randomCall uses no advertising or analytics cookies. Your browser stores only what the app needs: a random device id
          (for safety tools like blocks and bans), your settings, and your login session. Read the{' '}
          <Link href="/privacy" className="text-brand underline">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>
      <SiteFooter />
    </main>
  );
}

function ResendVerification({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'sent' | 'error'>('idle');
  return (
    <>
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">not confirmed</span>{' '}
      {state === 'sent' ? (
        <span className="text-xs text-slate-500">Link sent — check your inbox.</span>
      ) : (
        <button
          className="text-xs font-medium text-brand underline"
          onClick={() =>
            api('/auth/resend-verification', {}, token)
              .then(() => setState('sent'))
              .catch(() => setState('error'))
          }
        >
          {state === 'error' ? 'Could not send — retry' : 'Resend confirmation email'}
        </button>
      )}
    </>
  );
}

function ChangePassword({ token }: { token: string }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Section title="Change password">
      <form
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
        <Field id="current" label="Current password" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Field
          id="next"
          label={`New password (at least ${MIN_PASSWORD_LENGTH} characters)`}
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <FormError error={error} />
        {done && <FormNote>Password changed.</FormNote>}
        <Submit busy={busy}>Change password</Submit>
      </form>
    </Section>
  );
}

function DeleteAccount({ token, onDeleted }: { token: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Section title="Delete account">
      <p className="mt-2 text-sm text-slate-600">Permanently deletes your account and saved settings. This cannot be undone.</p>
      {!open ? (
        <button onClick={() => setOpen(true)} className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">
          Delete my account…
        </button>
      ) : (
        <form
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
          <Field id="delete-password" label="Enter your password to confirm" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <FormError error={error} />
          <button type="submit" disabled={busy} className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? 'Deleting…' : 'Permanently delete account'}
          </button>
        </form>
      )}
    </Section>
  );
}
