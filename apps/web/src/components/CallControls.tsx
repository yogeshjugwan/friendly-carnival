'use client';

import { useState } from 'react';
import { REACTIONS } from '@rc/shared';
import type { RandomCall } from '@/lib/useRandomCall';
import {
  BackIcon,
  ChevronUpIcon,
  HandIcon,
  MicIcon,
  MicOffIcon,
  PhoneOffIcon,
  SkipIcon,
  SmileIcon,
  VideoIcon,
  VideoOffIcon,
} from './icons';
import { SettingsMenu } from './SettingsMenu';

/** Meet-style round button: grey normally, red when "off", light blue when active. */
const round = (state: 'normal' | 'off' | 'active' = 'normal') =>
  `flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition sm:h-12 sm:w-12 ${
    state === 'off' ? 'bg-red-500 text-white hover:bg-red-600' : state === 'active' ? 'bg-sky-200 text-slate-900' : 'bg-[#3c4043] text-white hover:bg-[#4a4e52]'
  }`;

/** Mic / camera button with a small ^ that opens a device list (Meet style). */
function DeviceButton({
  on,
  onToggle,
  devices,
  currentId,
  onPick,
  label,
  OnIcon,
  OffIcon,
}: {
  on: boolean;
  onToggle: () => void;
  devices: { deviceId: string; label: string }[];
  currentId: string | null;
  onPick: (id: string) => void;
  label: string;
  OnIcon: (p: { className?: string }) => React.ReactElement;
  OffIcon: (p: { className?: string }) => React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex items-center rounded-full bg-[#2a2b2e]">
      {devices.length > 1 && (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={`Choose ${label.toLowerCase()}`}
          aria-expanded={open}
          className="hidden h-10 w-7 items-center justify-center rounded-l-full text-slate-300 hover:text-white sm:flex sm:h-12"
        >
          <ChevronUpIcon />
        </button>
      )}
      <button
        onClick={onToggle}
        aria-label={on ? `Turn ${label.toLowerCase()} off` : `Turn ${label.toLowerCase()} on`}
        aria-pressed={!on}
        title={on ? `Turn ${label.toLowerCase()} off` : `Turn ${label.toLowerCase()} on`}
        className={round(on ? 'normal' : 'off')}
      >
        {on ? <OnIcon /> : <OffIcon />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />
          <ul className="absolute bottom-full left-0 z-30 mb-3 w-64 max-w-[80vw] overflow-hidden rounded-xl bg-white py-1 text-sm text-ink shadow-xl" role="listbox" aria-label={label}>
            {devices.map((d) => (
              <li key={d.deviceId}>
                <button
                  role="option"
                  aria-selected={d.deviceId === currentId}
                  onClick={() => {
                    onPick(d.deviceId);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-100 ${d.deviceId === currentId ? 'font-semibold text-brand' : ''}`}
                >
                  <span className="w-4">{d.deviceId === currentId ? '✓' : ''}</span>
                  <span className="truncate">{d.label || label}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * The call bar: mic, camera, reactions, raise hand, ⋮ (settings), end call,
 * Next — plus Back when available. Laid out like Google Meet.
 */
export function CallControls({ call, matched }: { call: RandomCall; matched: boolean }) {
  const [showReactions, setShowReactions] = useState(false);

  return (
    <div className="flex flex-col items-center gap-2">
      {showReactions && (
        <div className="flex max-w-[95vw] gap-0.5 overflow-x-auto rounded-full bg-[#2a2b2e]/95 px-2 py-1.5 shadow-lg" role="toolbar" aria-label="Reactions">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              disabled={!matched}
              onClick={() => call.sendReaction(emoji)}
              aria-label={emoji === '✋' ? 'Raise hand' : `Send ${emoji}`}
              // ✋ has its own button on wider screens; on phones it lives here.
              className={`rounded-full p-1.5 text-xl transition hover:scale-125 hover:bg-white/10 disabled:opacity-40 sm:text-2xl ${emoji === '✋' ? 'sm:hidden' : ''}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 rounded-full bg-[#202124]/90 px-2 py-1.5 shadow-xl backdrop-blur sm:gap-2.5 sm:px-3 sm:py-2">
        {call.canGoBack && (
          <button onClick={call.back} aria-label="Back to the previous stranger" title="Back to the person you just skipped" className={round()}>
            <BackIcon />
          </button>
        )}
        <DeviceButton
          label="Microphone"
          on={call.micOn}
          onToggle={call.toggleMic}
          devices={call.mics}
          currentId={call.micId}
          onPick={(id) => void call.switchDevice('audio', id)}
          OnIcon={MicIcon}
          OffIcon={MicOffIcon}
        />
        <DeviceButton
          label="Camera"
          on={call.cameraOn}
          onToggle={call.toggleCamera}
          devices={call.cameras}
          currentId={call.cameraId}
          onPick={(id) => void call.switchDevice('video', id)}
          OnIcon={VideoIcon}
          OffIcon={VideoOffIcon}
        />
        <button
          onClick={() => setShowReactions((s) => !s)}
          aria-label="Reactions"
          aria-pressed={showReactions}
          title="Send a reaction"
          className={round(showReactions ? 'active' : 'normal')}
        >
          <SmileIcon />
        </button>
        <button
          onClick={() => call.sendReaction('✋')}
          disabled={!matched}
          aria-label="Raise hand"
          title="Raise hand"
          className={`${round()} hidden disabled:opacity-40 sm:flex`}
        >
          <HandIcon />
        </button>
        <SettingsMenu call={call} variant="more" className={round()} />
        <button
          onClick={call.stop}
          aria-label="End call"
          title="End call"
          className="flex h-10 w-14 shrink-0 items-center justify-center rounded-full bg-red-500 text-white transition hover:bg-red-600 sm:h-12 sm:w-[4.5rem]"
        >
          <PhoneOffIcon />
        </button>
        <button
          onClick={call.next}
          aria-label="Next stranger"
          title="Next stranger"
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-brand px-3.5 font-semibold text-white transition hover:bg-brand-dark sm:h-12 sm:px-5"
        >
          <span className="hidden sm:inline">Next</span>
          <SkipIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

/** Reactions floating up over the video. */
export function ReactionLayer({ call }: { call: RandomCall }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-live="polite">
      {call.reactions.map((r) => (
        <span
          key={r.id}
          className="rc-float-up absolute bottom-24 text-4xl drop-shadow-lg sm:text-5xl"
          style={{ left: `${r.x}%` }}
          aria-label={r.mine ? `You sent ${r.emoji}` : `Partner sent ${r.emoji}`}
        >
          {r.emoji}
        </span>
      ))}
    </div>
  );
}
