'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { loadSettings } from '@/lib/settings';
import type { RandomCall } from '@/lib/useRandomCall';
import { GearIcon } from './icons';

/** Call settings: camera, microphone, allow reconnect. */
export function SettingsContent({ call }: { call: RandomCall }) {
  const { saveSettings } = useAuth();
  return (
    <div className="space-y-4">
      {call.mode === 'video' && call.cameras.length > 0 && (
        <>
          <label className="block text-sm">
            <span className="font-medium text-mute">Camera</span>
            <select
              value={call.cameraId ?? ''}
              onChange={(e) => void call.switchDevice('video', e.target.value)}
              className="mt-1 w-full rounded-lg border border-line-2 px-2 py-2"
            >
              {call.cameras.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-mute">Microphone</span>
            <select
              value={call.micId ?? ''}
              onChange={(e) => void call.switchDevice('audio', e.target.value)}
              className="mt-1 w-full rounded-lg border border-line-2 px-2 py-2"
            >
              {call.mics.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={call.allowReconnect}
          onChange={(e) => void saveSettings({ ...loadSettings(), allowReconnect: e.target.checked })}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          <span className="font-medium">Allow reconnect</span>
          <span className="block text-dim">People you skip can press Back to reach you again.</span>
        </span>
      </label>
      <Link href="/settings" className="block text-sm font-medium text-lime hover:underline">
        All settings →
      </Link>
    </div>
  );
}

/** Gear button with the call settings (used in text chat; video calls use ⋮). */
export function SettingsMenu({ call }: { call: RandomCall }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Settings"
        title="Settings"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-[#e6e8ec] hover:bg-card-2"
      >
        <GearIcon />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-30 mt-2 w-72 max-w-[85vw] rounded-xl bg-card p-4 text-[#f4f5f7] shadow-xl">
            <SettingsContent call={call} />
          </div>
        </>
      )}
    </div>
  );
}
