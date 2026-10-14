'use client';

import { useState } from 'react';
import { REACTIONS } from '@rc/shared';
import type { RandomCall } from '@/lib/useRandomCall';
import { BackIcon, ChatIcon, ChevronUpIcon, MicIcon, MicOffIcon, SmileIcon, VideoIcon, VideoOffIcon } from './icons';
import { GiftButton } from './Coins';
import { FriendButton } from './Friends';
import { MoreMenu } from './MoreMenu';
import { useI18n } from '@/lib/i18n';

/** Control button: translucent normally, red when "off", lime when active. Rail = the round buttons over the video on phones. */
const ctl = (state: 'normal' | 'off' | 'active' = 'normal', rail = false) =>
  `relative flex h-12 w-12 shrink-0 items-center justify-center transition ${rail ? 'rounded-full backdrop-blur' : 'rounded-[14px]'} ${
    state === 'off'
      ? 'bg-[#e5484d] text-white hover:bg-[#d93c41]'
      : state === 'active'
        ? 'bg-lime text-night'
        : rail
          ? 'bg-black/45 text-white hover:bg-black/60'
          : 'bg-white/[.08] text-[#e6e8ec] hover:bg-white/[.14]'
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
  rail,
}: {
  on: boolean;
  onToggle: () => void;
  devices: { deviceId: string; label: string }[];
  currentId: string | null;
  onPick: (id: string) => void;
  label: string;
  OnIcon: (p: { className?: string }) => React.ReactElement;
  OffIcon: (p: { className?: string }) => React.ReactElement;
  rail: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex items-center">
      {devices.length > 1 && !rail && (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={`Choose ${label.toLowerCase()}`}
          aria-expanded={open}
          className="flex h-12 w-5 items-center justify-center text-dim hover:text-white"
        >
          <ChevronUpIcon />
        </button>
      )}
      <button
        onClick={onToggle}
        aria-label={on ? `Turn ${label.toLowerCase()} off` : `Turn ${label.toLowerCase()} on`}
        aria-pressed={!on}
        title={on ? `Turn ${label.toLowerCase()} off` : `Turn ${label.toLowerCase()} on`}
        className={ctl(on ? 'normal' : 'off', rail)}
      >
        {on ? <OnIcon /> : <OffIcon />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />
          <ul className="absolute bottom-full left-0 z-30 mb-3 w-64 max-w-[80vw] overflow-hidden rounded-xl border border-line-2 bg-card-2 py-1 text-sm text-[#e6e8ec] shadow-xl" role="listbox" aria-label={label}>
            {devices.map((d) => (
              <li key={d.deviceId}>
                <button
                  role="option"
                  aria-selected={d.deviceId === currentId}
                  onClick={() => {
                    onPick(d.deviceId);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/10 ${d.deviceId === currentId ? 'font-semibold text-lime' : ''}`}
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
 * The call controls: mic, camera, chat, add friend, gift, reactions and ⋮ (games,
 * effects, settings…). A row under the video on larger screens; a column over the
 * right edge of the video on phones (`rail`).
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
  rail?: boolean;
}

export function CallControls({ call, matched, chatOpen, onToggleChat, unread, fit, onToggleFit, onToggleFullscreen, rail = false }: ControlsProps) {
  const { t } = useI18n();
  const [showReactions, setShowReactions] = useState(false);
  // Menus open above the bar, or to the left of the rail.
  const menuPos = rail ? 'absolute right-full top-0 mr-2' : 'absolute bottom-full left-0 mb-3';

  return (
    <div className={`relative flex items-center gap-2 ${rail ? 'flex-col' : ''}`}>
      {showReactions && (
        <div
          className={`absolute z-30 flex max-w-[80vw] gap-0.5 overflow-x-auto rounded-2xl border border-line-2 bg-card-2 px-2 py-1.5 shadow-lg ${rail ? 'right-full top-1/2 mr-2 -translate-y-1/2' : 'bottom-full left-0 mb-3'}`}
          role="toolbar"
          aria-label="Reactions"
        >
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
      {call.canGoBack && !rail && (
        <button onClick={call.back} aria-label={t('call.back')} title={t('call.back')} className={ctl()}>
          <BackIcon />
        </button>
      )}
      <DeviceButton
        rail={rail}
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
          rail={rail}
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
      <button
        onClick={onToggleChat}
        aria-label={unread ? `${t('call.chat')}, ${unread}` : t('call.chat')}
        aria-pressed={chatOpen}
        title={t('call.chat')}
        className={ctl(chatOpen ? 'active' : 'normal', rail)}
      >
        <ChatIcon />
        {unread > 0 && !chatOpen && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {matched && <FriendButton call={call} iconClass={ctl('normal', rail)} />}
      {matched && <GiftButton call={call} iconClass={ctl('normal', rail)} menuPos={rail ? '!left-auto right-full top-0 mr-2' : 'bottom-full mb-3'} />}
      <button
        onClick={() => setShowReactions((s) => !s)}
        aria-label="Reactions"
        aria-pressed={showReactions}
        title={t('call.reactions')}
        className={ctl(showReactions ? 'active' : 'normal', rail)}
      >
        <SmileIcon />
      </button>
      <MoreMenu call={call} className={ctl('normal', rail)} fit={fit} onToggleFit={onToggleFit} onToggleFullscreen={onToggleFullscreen} menuPos={menuPos} />
    </div>
  );
}

/** Stop (dark red) and Next (lime; the Space key also works). `wide` = full width on phones. */
export function StopNext({ call, wide = false, compact = false }: { call: RandomCall; wide?: boolean; compact?: boolean }) {
  const { t } = useI18n();
  const h = compact ? 'h-12' : 'h-14 max-sm:h-[58px]';
  return (
    <div className={`flex items-center gap-2.5 ${wide ? 'w-full' : ''}`}>
      <button
        onClick={call.stop}
        aria-label={t('call.end')}
        title={t('call.end')}
        className={`${h} rounded-2xl bg-stop px-6 text-base font-semibold text-stop-text transition hover:brightness-125 ${wide ? 'w-24 px-0' : ''}`}
      >
        {t('call.stop')}
      </button>
      <button
        onClick={call.next}
        aria-label={t('call.nextStranger')}
        title={`${t('call.nextStranger')} (Space)`}
        aria-keyshortcuts="Space"
        className={`${h} rounded-2xl bg-lime px-9 font-display text-lg font-bold text-night transition hover:bg-lime-hover ${wide ? 'flex-1 px-0 text-[19px]' : ''}`}
      >
        {t('call.next')} →
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
