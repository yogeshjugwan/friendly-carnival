'use client';

import { useState } from 'react';
import type { RandomCall } from '@/lib/useRandomCall';

export function SettingsMenu({ call }: { call: RandomCall }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="rounded-lg bg-slate-700 px-3 py-2 font-medium hover:bg-slate-600"
      >
        Settings
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 space-y-4 rounded-xl bg-white p-4 text-ink shadow-xl">
          {call.mode === 'video' && call.cameras.length > 0 && (
            <>
              <label className="block text-sm">
                <span className="font-medium text-slate-600">Camera</span>
                <select
                  value={call.cameraId ?? ''}
                  onChange={(e) => void call.switchDevice('video', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2"
                >
                  {call.cameras.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-600">Microphone</span>
                <select
                  value={call.micId ?? ''}
                  onChange={(e) => void call.switchDevice('audio', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2"
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
              onChange={(e) => call.setAllowReconnect(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="font-medium">Allow reconnect</span>
              <span className="block text-slate-500">People you skip can press Back to reach you again.</span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
