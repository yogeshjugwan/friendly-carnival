'use client';

import { useState } from 'react';
import { REACTIONS } from '@rc/shared';
import type { RandomCall } from '@/lib/useRandomCall';
import {
  BackIcon,
  ChatIcon,
  ChevronUpIcon,
  MicIcon,
  MicOffIcon,
  SkipIcon,
  SmileIcon,
  VideoIcon,
  VideoOffIcon,
} from './icons';
import { EffectsButton } from './Effects';
import { MoreMenu } from './MoreMenu';
import { useI18n } from '@/lib/i18n';

/** Square control: dark normally, red when "off", lime when active. */
const round = (state: 'normal' | 'off' | 'active' = 'normal') =>
  `flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition max-[380px]:h-9 max-[380px]:w-9 sm:h-12 sm:w-12 sm:rounded-[14px] [@media(max-height:500px)]:h-10 [@media(max-height:500px)]:w-10 ${
    state === 'off' ? 'bg-[#e5484d] text-white hover:bg-[#d93c41]' : state === 'active' ? 'bg-lime text-night' : 'bg-[#1d2230] text-[#e8ebf2] hover:bg-[#262c3b]'
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
    <div className="relative flex items-center rounded-xl sm:rounded-[14px]">
      {devices.length > 1 && (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={`Choose ${label.toLowerCase()}`}
          aria-expanded={open}
          className="hidden h-10 w-6 items-center justify-center text-dim hover:text-white sm:flex sm:h-12"
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
 * The call bar: mic, camera, effects, reactions, chat, ⋮ (settings), end call,
 * Next — plus Back when available. Laid out like Google Meet.
 */
interface ControlsProps {
  call: RandomCall;
  matched: boolean;
  chatOpen: boolean;
  onToggleChat: () => void;
  /** Partner messages not seen yet (chat closed). */
  unread: number;
  fit: boolean;
  onToggleFit: () => void;
  onToggleFullscreen: () => void;
}

export function CallControls({ call, matched, chatOpen, onToggleChat, unread, fit, onToggleFit, onToggleFullscreen }: ControlsProps) {
  const { t } = useI18n();
  const [showReactions, setShowReactions] = useState(false);

  return (
    <div className="flex flex-col items-center gap-2">
      {showReactions && (
        <div className="flex max-w-[95vw] gap-0.5 overflow-x-auto rounded-2xl border border-line bg-card px-2 py-1.5 shadow-lg" role="toolbar" aria-label="Reactions">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              disabled={!matched}
              onClick={() => call.sendReaction(emoji)}
              aria-label={emoji === '✋' ? 'Raise hand' : `Send ${emoji}`}
              className="rounded-full p-1.5 text-xl transition hover:scale-125 hover:bg-white/10 disabled:opacity-40 sm:text-2xl"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 rounded-[18px] border border-line bg-card p-1.5 sm:gap-2 [@media(max-height:500px)]:gap-1.5">
        {call.canGoBack && (
          // On phones Back lives in the ⋮ menu to save room.
          <button onClick={call.back} aria-label={t('call.back')} title={t('call.back')} className={`${round()} max-sm:!hidden`}>
            <BackIcon />
          </button>
        )}
        <DeviceButton
          label={t('call.mic')}
          on={call.micOn}
          onToggle={call.toggleMic}
          devices={call.mics}
          currentId={call.micId}
          onPick={(id) => void call.switchDevice('audio', id)}
          OnIcon={MicIcon}
          OffIcon={MicOffIcon}
        />
        {call.mode === 'video' && (
          <DeviceButton
            label={t('call.camera')}
            on={call.cameraOn}
            onToggle={call.toggleCamera}
            devices={call.cameras}
            currentId={call.cameraId}
            onPick={(id) => void call.switchDevice('video', id)}
            OnIcon={VideoIcon}
            OffIcon={VideoOffIcon}
          />
        )}
        {call.mode === 'video' && (
          // Phones reach effects through ⋮ to keep the bar narrow.
          <div className="hidden sm:block [@media(max-height:500px)]:hidden">
            <EffectsButton call={call} className={round()} />
          </div>
        )}
        <button
          onClick={() => setShowReactions((s) => !s)}
          aria-label="Reactions"
          aria-pressed={showReactions}
          title={t('call.reactions')}
          className={round(showReactions ? 'active' : 'normal')}
        >
          <SmileIcon />
        </button>
        <button
          onClick={onToggleChat}
          aria-label={unread ? `${t('call.chat')}, ${unread}` : t('call.chat')}
          aria-pressed={chatOpen}
          title={t('call.chat')}
          className={`relative ${round(chatOpen ? 'active' : 'normal')}`}
        >
          <ChatIcon />
          {unread > 0 && !chatOpen && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
        <MoreMenu call={call} className={round()} fit={fit} onToggleFit={onToggleFit} onToggleFullscreen={onToggleFullscreen} />
      </div>
    </div>
  );
}

/** Stop (red) and Next (lime, also the Space key) on the right of the call bar. */
export function StopNext({ call, compact = false }: { call: RandomCall; compact?: boolean }) {
  const { t } = useI18n();
  const h = compact ? 'h-12' : 'h-12 sm:h-14';
  return (
    <div className="flex items-center gap-2.5">
      <button
        onClick={call.stop}
        aria-label={t('call.end')}
        title={t('call.end')}
        className={`flex ${h} items-center gap-2 rounded-2xl bg-[#e5484d] px-4 text-[15px] font-semibold text-white transition hover:bg-[#d93c41] sm:px-[18px]`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
          <rect x="4" y="4" width="16" height="16" rx="3" />
        </svg>
        {t('call.stop')}
      </button>
      <button
        onClick={call.next}
        aria-label={t('call.nextStranger')}
        title={`${t('call.nextStranger')} (Space)`}
        aria-keyshortcuts="Space"
        className={`flex ${h} items-center gap-2.5 rounded-2xl bg-lime px-5 text-base font-bold text-night transition hover:bg-lime-hover sm:px-[22px]`}
      >
        {t('call.next')}
        <SkipIcon className="h-5 w-5" />
        <kbd className="rounded-[5px] bg-night/15 px-1.5 py-0.5 font-sans text-[11px] font-semibold max-sm:hidden">Space</kbd>
      </button>
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
