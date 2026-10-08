'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { currentSubscription, disablePush, enablePush, pushSupported, registerServiceWorker } from '@/lib/pwa';

/** Mounted once in the layout. */
export function PwaSetup() {
  useEffect(() => registerServiceWorker(), []);
  return null;
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  // Caught by the inline script in the layout (it can fire before this module loads).
  const take = () => {
    const w = window as Window & { __rcInstall?: InstallPromptEvent };
    if (w.__rcInstall) deferred = w.__rcInstall;
    listeners.forEach((l) => l());
  };
  take();
  window.addEventListener('rc:installable', take);
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/** "Install app": the browser's install prompt, or Add to Home Screen steps on iPhone. */
export function InstallButton({ className = '' }: { className?: string }) {
  const [state, setState] = useState<'hidden' | 'prompt' | 'ios'>('hidden');
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    const update = () => setState(isStandalone() ? 'hidden' : deferred ? 'prompt' : isIos() ? 'ios' : 'hidden');
    update();
    listeners.add(update);
    return () => void listeners.delete(update);
  }, []);

  if (state === 'hidden') return null;
  return (
    <div className={className}>
      <button
        onClick={async () => {
          if (state === 'ios') return setIosHelp((v) => !v);
          await deferred?.prompt();
          deferred = null;
          setState('hidden');
        }}
        className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-2 bg-card px-4 text-sm text-[#e8ebf2] hover:border-[#384056]"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
        </svg>
        Install the app
      </button>
      {iosHelp && (
        <p className="mt-2 text-sm text-slate-300">
          In Safari, tap <strong>Share</strong> <span aria-hidden>⬆️</span> then <strong>Add to Home Screen</strong>.
        </p>
      )}
    </div>
  );
}

/** On/off switch for push notifications on this device. */
export function NotificationsToggle({ compact = false }: { compact?: boolean }) {
  const { token } = useAuth();
  const [state, setState] = useState<'loading' | 'unsupported' | 'on' | 'off' | 'blocked'>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pushSupported()) return setState('unsupported');
    if (Notification.permission === 'denied') return setState('blocked');
    void currentSubscription().then((s) => setState(s ? 'on' : 'off'));
  }, []);

  if (!token || state === 'loading') return null;
  if (state === 'unsupported') {
    return compact ? null : (
      <p className="text-sm text-slate-500">
        This browser can&apos;t show notifications{isIos() ? ' — add randomCall to your Home Screen first (Share → Add to Home Screen).' : '.'}
      </p>
    );
  }
  if (state === 'blocked') {
    return <p className="text-sm text-slate-500">Notifications are blocked for this site. Allow them in your browser&apos;s site settings.</p>;
  }

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      if (state === 'on') {
        await disablePush(token);
        setState('off');
      } else {
        const p = await enablePush(token);
        setState(p === 'granted' ? 'on' : p === 'denied' ? 'blocked' : 'off');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change notifications');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        onClick={() => void toggle()}
        disabled={busy}
        className={
          compact
            ? 'w-full rounded-lg bg-white/10 px-3 py-2 text-left text-sm text-slate-100 hover:bg-white/15 disabled:opacity-50'
            : `rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${state === 'on' ? 'bg-slate-200 hover:bg-slate-300' : 'bg-brand text-white hover:bg-brand-dark'}`
        }
      >
        {busy ? 'Working…' : state === 'on' ? '🔕 Turn off notifications' : '🔔 Notify me when friends come online'}
      </button>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
