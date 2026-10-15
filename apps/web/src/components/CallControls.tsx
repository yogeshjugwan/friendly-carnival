'use client';

import { useState } from 'react';
import type { RandomCall } from '@/lib/useRandomCall';
import { BackIcon, ChatIcon, ChevronUpIcon, MicIcon, MicOffIcon, VideoIcon, VideoOffIcon } from './icons';
import { GiftButton } from './Coins';
import { FriendButton } from './Friends';
import { MoreMenu } from './MoreMenu';
import { EffectsGrid } from './Effects';
import { MASK_OPTIONS } from '@/lib/faceMask';
import { useI18n } from '@/lib/i18n';

/**
 * Control tile: icon over a small label. Dark tile, white when switched off (muted / camera off), gradient when open.
 * Rail = the phone row (tiles share the width, 62×60 max); larger screens get 68×58 tiles.
 */
const ctl = (state: 'normal' | 'off' | 'active' = 'normal', rail = false) =>
  `relative flex shrink-0 flex-col items-center justify-center gap-1 p-0 text-[11px] font-semibold leading-none transition [&_svg]:h-5 [&_svg]:w-5 ${
    rail ? 'h-[60px] min-w-0 max-w-[62px] flex-1 rounded-2xl sm:h-[58px] sm:w-[68px] sm:max-w-none sm:flex-none sm:rounded-[14px]' : 'h-[58px] w-[68px] rounded-[14px]'
  } ${
    state === 'off'
      ? 'bg-[#f4f5f7] text-night'
      : state === 'active'
        ? 'bg-lime text-night'
        : rail
          ? 'bg-white/10 text-white hover:bg-white/20 sm:bg-card-2 sm:text-[#e6e8ec] sm:hover:bg-[#2a2236]'
          : 'bg-card-2 text-[#e6e8ec] hover:bg-[#2a2236]'
  }`;

/** The small label under a control icon. */
export const CtlLabel = ({ children }: { children: React.ReactNode }) => <span className="max-w-full truncate px-0.5">{children}</span>;

/** Mic / camera button with a small ^ that opens a device list (Meet style). */
function DeviceButton({
  on,
  onToggle,
  devices,
  currentId,
  onPick,
  label,
  onText,
  offText,
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
  onText: string;
  offText: string;
  OnIcon: (p: { className?: string }) => React.ReactElement;
  OffIcon: (p: { className?: string }) => React.ReactElement;
  rail: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`relative flex items-center ${rail ? 'min-w-0 max-w-[62px] flex-1 sm:max-w-none sm:flex-none [&>button]:max-w-none' : ''}`}>
      <button
        onClick={onToggle}
        aria-label={on ? `Turn ${label.toLowerCase()} off` : `Turn ${label.toLowerCase()} on`}
        aria-pressed={!on}
        title={on ? `Turn ${label.toLowerCase()} off` : `Turn ${label.toLowerCase()} on`}
        className={ctl(on ? 'normal' : 'off', rail)}
      >
        {on ? <OnIcon /> : <OffIcon />}
        <CtlLabel>{on ? onText : offText}</CtlLabel>
      </button>
      {/* Pick another mic/camera: a small badge on the button's corner, like Meet. */}
      {devices.length > 1 && !rail && (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={`Choose ${label.toLowerCase()}`}
          aria-expanded={open}
          className="absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-line-2 bg-card text-mute hover:text-white [&_svg]:h-3 [&_svg]:w-3"
        >
          <ChevronUpIcon />
        </button>
      )}
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
  /** While matching: just the mic and camera. */
  minimal?: boolean;
}

export function CallControls({ call, matched, chatOpen, onToggleChat, unread, fit, onToggleFit, onToggleFullscreen, rail = false, minimal = false }: ControlsProps) {
  const { t } = useI18n();
  // Menus open above the bar.
  const menuPos = rail ? 'absolute bottom-full right-0 mb-3' : 'absolute bottom-full right-0 mb-3';

  return (
    <div className={`relative flex items-center gap-2 ${rail ? 'w-full justify-between max-sm:gap-1.5 sm:w-auto sm:justify-start' : ''}`}>
      {call.canGoBack && !rail && (
        <button onClick={call.back} aria-label={t('call.back')} title={t('call.back')} className={ctl()}>
          <BackIcon />
          <CtlLabel>Back</CtlLabel>
        </button>
      )}
      <DeviceButton
        rail={rail}
        label={t('call.mic')}
        onText="Mute"
        offText="Unmute"
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
          onText="Cam off"
          offText="Cam on"
          on={call.cameraOn}
          onToggle={call.toggleCamera}
          devices={call.cameras}
          currentId={call.cameraId}
          onPick={(id) => void call.switchDevice('video', id)}
          OnIcon={VideoIcon}
          OffIcon={VideoOffIcon}
        />
      )}
      {call.mode === 'video' && <MaskButton call={call} className={ctl(call.faceMask !== 'none' ? 'active' : 'normal', rail)} />}
      {!minimal && (
        <>
      <button
        onClick={onToggleChat}
        aria-label={unread ? `${t('call.chat')}, ${unread}` : t('call.chat')}
        aria-pressed={chatOpen}
        title={t('call.chat')}
        className={ctl(chatOpen ? 'active' : 'normal', rail)}
      >
        <ChatIcon />
        <CtlLabel>Chat</CtlLabel>
        {unread > 0 && !chatOpen && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {matched && <FriendButton call={call} iconClass={ctl('normal', rail)} withLabel />}
      {matched && <GiftButton call={call} iconClass={ctl('normal', rail)} withLabel menuPos="!left-auto right-0 bottom-full mb-3" />}
      <MoreMenu call={call} className={ctl('normal', rail)} fit={fit} onToggleFit={onToggleFit} onToggleFullscreen={onToggleFullscreen} menuPos={menuPos} withLabel />
        </>
      )}
    </div>
  );
}

/** Masks: face masks and backgrounds, one tap away (free for everyone). */
function MaskButton({ call, className }: { call: RandomCall; className: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Face masks and backgrounds" title="Face masks" className={className}>
        <span className="text-xl leading-none" aria-hidden>
          {MASK_OPTIONS.find((m) => m.kind === call.faceMask && m.kind !== 'none')?.emoji ?? '🐶'}
        </span>
        <CtlLabel>Masks</CtlLabel>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="fixed inset-x-2 bottom-24 z-40 max-h-[70dvh] overflow-y-auto rounded-2xl border border-line-2 bg-card p-4 text-[#f4f5f7] shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-full sm:right-0 sm:mb-3 sm:w-80 sm:max-w-[calc(100vw-2rem)]">
            <div className="mb-3 flex items-center gap-2">
              <p className="m-0 font-display font-bold">Face masks & backgrounds</p>
              {call.backgroundBusy && <span className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-line-2 border-t-lime" aria-label="Loading" />}
            </div>
            <EffectsGrid call={call} />
          </div>
        </>
      )}
    </div>
  );
}

/** Cancel matching (outlined), in place of Stop / Next while looking for someone. Esc also works. */
export function CancelButton({ call, wide = false }: { call: RandomCall; wide?: boolean }) {
  return (
    <button
      onClick={call.stop}
      aria-keyshortcuts="Escape"
      className={`h-14 rounded-2xl border-[1.5px] border-[#6b5d84] px-8 text-base font-semibold text-[#e6e8ec] transition hover:bg-white/5 ${wide ? 'max-sm:flex-1' : ''}`}
    >
      Cancel
    </button>
  );
}

/** Stop (outlined) and Next → (gradient). Keys: Esc stops, → (or Space) for next. `wide` = full width on phones. */
export function StopNext({ call, wide = false, compact = false }: { call: RandomCall; wide?: boolean; compact?: boolean }) {
  const { t } = useI18n();
  const h = compact ? 'h-12' : 'h-14 max-sm:h-[58px]';
  return (
    <div className={`flex items-center gap-2.5 sm:w-auto sm:flex-none ${wide ? 'w-full' : ''}`}>
      <button
        onClick={call.stop}
        aria-label={t('call.end')}
        title={t('call.end')}
        aria-keyshortcuts="Escape"
        className={`${h} rounded-2xl border-[1.5px] border-[#6b5d84] px-6 text-base font-semibold text-[#e6e8ec] transition hover:bg-white/5 ${wide ? 'max-sm:w-24 max-sm:px-0' : ''}`}
      >
        {t('call.stop')}
      </button>
      <button
        onClick={call.next}
        aria-label={t('call.nextStranger')}
        title={`${t('call.nextStranger')} (→)`}
        aria-keyshortcuts="ArrowRight Space"
        className={`${h} rounded-2xl bg-lime px-10 font-display sm:w-auto sm:flex-none text-lg font-bold text-night transition ${wide ? 'max-sm:flex-1 max-sm:px-0 max-sm:text-[19px]' : ''}`}
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
