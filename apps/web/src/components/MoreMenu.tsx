'use client';

import { useEffect, useState } from 'react';
import type { RandomCall } from '@/lib/useRandomCall';
import { CONTACT_EMAIL } from './LegalPage';
import { GAMES } from '@rc/shared';
import { BackIcon, MoreVerticalIcon } from './icons';
import { BlockedList } from './BlockedList';
import { BoostCard } from './Coins';
import { EffectsGrid } from './Effects';
import { SettingsContent } from './SettingsMenu';

type IconProps = { className?: string };
const svg = (path: React.ReactNode) =>
  function Icon({ className = 'h-5 w-5' }: IconProps) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {path}
      </svg>
    );
  };
const ViewIcon = svg(
  <>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="4" rx="1" />
    <rect x="14" y="10" width="7" height="11" rx="1" />
    <rect x="3" y="13" width="7" height="8" rx="1" />
  </>,
);
const FullIcon = svg(<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />);
const PipIcon = svg(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <rect x="12" y="7" width="6" height="5" rx="1" fill="currentColor" />
  </>,
);
const EffectsIcon = svg(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="12" cy="10" r="3" />
    <path d="M6 20a6 6 0 0 1 12 0M18 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
  </>,
);
const ProblemIcon = svg(
  <>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <path d="M12 7v4M12 14h.01" />
  </>,
);
const AbuseIcon = svg(
  <>
    <path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86z" />
    <path d="M12 8v4M12 16h.01" />
  </>,
);
const BlockIcon = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m5.7 5.7 12.6 12.6" />
  </>,
);
const DiceIcon = svg(
  <>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <circle cx="8" cy="8" r="1.2" fill="currentColor" />
    <circle cx="16" cy="16" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
  </>,
);
const HelpIcon = svg(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5M8 11h1.5l1-2 1.5 4 1-2H14" />
  </>,
);
const GearIcon = svg(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>,
);

interface Props {
  call: RandomCall;
  className: string;
  /** Video fills the tile (cropped) or fits inside it. */
  fit: boolean;
  onToggleFit: () => void;
  onToggleFullscreen: () => void;
  /** Where the menu opens, relative to the button. */
  menuPos?: string;
  /** Show "More" under the icon (call controls). */
  withLabel?: boolean;
}

/** The ⋮ "More options" menu, laid out like Google Meet's. */
export function MoreMenu({ call, className, fit, onToggleFit, onToggleFullscreen, menuPos = 'absolute bottom-full right-0 mb-3 sm:-right-20', withLabel = false }: Props) {
  const pos = menuPos;
  const [view, setView] = useState<'closed' | 'menu' | 'settings' | 'effects' | 'blocked' | 'boost' | 'games'>('closed');
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const close = () => setView('closed');
  const item = (Icon: (p: IconProps) => React.ReactElement, label: string, onClick: () => void, extra?: string) => (
    <button
      role="menuitem"
      onClick={() => {
        onClick();
        close();
      }}
      className="flex w-full items-center gap-4 px-4 py-3 text-left text-[15px] text-[#f4f5f7] hover:bg-white/10"
    >
      <Icon className="h-5 w-5 shrink-0 text-mute" />
      <span className="flex-1">{label}</span>
      {extra && <span className="text-xs text-dim">{extra}</span>}
    </button>
  );

  return (
    <div className={`relative ${withLabel ? 'flex min-w-0 max-w-[62px] flex-1 sm:max-w-none sm:flex-none [&>button]:max-w-none' : ''}`}>
      <button
        onClick={() => setView((v) => (v === 'closed' ? 'menu' : 'closed'))}
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={view !== 'closed'}
        title="More options"
        className={className}
      >
        <MoreVerticalIcon />
        {withLabel && <span className="max-w-full truncate px-0.5">More</span>}
      </button>

      {view !== 'closed' && (
        <>
          <div className="fixed inset-0 z-30" onClick={close} aria-hidden />
          {view === 'menu' ? (
            <div
              role="menu"
              aria-label="More options"
              className={`${pos} z-40 max-h-[70dvh] w-72 max-w-[88vw] overflow-y-auto rounded-xl border border-line-2 bg-card-2 py-2 shadow-2xl`}
            >
              {item(ViewIcon, 'Adjust view', onToggleFit, fit ? 'Fit' : 'Fill')}
              {item(FullIcon, fullscreen ? 'Exit full screen' : 'Full screen', onToggleFullscreen)}
              {item(PipIcon, 'Open picture-in-picture', () => void call.togglePictureInPicture())}
              {call.partner && item(DiceIcon, 'Icebreaker question', call.askIcebreaker)}
              {call.partner && call.mode !== 'text' && (
                <button
                  role="menuitem"
                  onClick={() => setView('games')}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left text-[15px] text-[#f4f5f7] hover:bg-white/10"
                >
                  <span className="w-5 text-center" aria-hidden>
                    🎮
                  </span>
                  <span className="flex-1">Play a game together</span>
                </button>
              )}
              {call.mode === 'video' && (
                <button
                  role="menuitem"
                  onClick={() => setView('effects')}
                  className="flex w-full items-center gap-4 px-4 py-3 text-left text-[15px] text-[#f4f5f7] hover:bg-white/10"
                >
                  <EffectsIcon className="h-5 w-5 shrink-0 text-mute" />
                  <span className="flex-1">Face masks & backgrounds</span>
                  {call.background !== 'none' && <span className="text-xs text-lime">On</span>}
                </button>
              )}
              {call.canGoBack && <div className="sm:hidden">{item(BackIcon, 'Back to previous stranger', call.back)}</div>}
              <button
                role="menuitem"
                onClick={() => setView('boost')}
                className="flex w-full items-center gap-4 px-4 py-3 text-left text-[15px] text-[#f4f5f7] hover:bg-white/10"
              >
                <span className="w-5 text-center" aria-hidden>
                  🚀
                </span>
                <span className="flex-1">Boost</span>
                {call.wallet?.boostUntil && call.wallet.boostUntil > Date.now() && <span className="text-xs text-lime">On</span>}
              </button>
              <div className="my-1.5 border-t border-white/10" />
              {item(ProblemIcon, 'Report a problem', () => {
                window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('randomCall: problem report')}`;
              })}
              {item(AbuseIcon, 'Report abuse', () => window.dispatchEvent(new Event('rc:report')))}
              <button
                role="menuitem"
                onClick={() => setView('blocked')}
                className="flex w-full items-center gap-4 px-4 py-3 text-left text-[15px] text-[#f4f5f7] hover:bg-white/10"
              >
                <BlockIcon className="h-5 w-5 shrink-0 text-mute" />
                <span>Blocked people</span>
              </button>
              {item(HelpIcon, 'Troubleshooting & help', () => window.open('/help', '_blank', 'noopener'))}
              <button
                role="menuitem"
                onClick={() => setView('settings')}
                className="flex w-full items-center gap-4 px-4 py-3 text-left text-[15px] text-[#f4f5f7] hover:bg-white/10"
              >
                <GearIcon className="h-5 w-5 shrink-0 text-mute" />
                <span>Settings</span>
              </button>
            </div>
          ) : view === 'games' ? (
            <div className={`${pos} z-40 w-72 max-w-[88vw] rounded-xl border border-line-2 bg-card-2 p-2 text-[#f4f5f7] shadow-2xl`}>
              <div className="mb-1 flex items-center gap-2 px-1">
                <button onClick={() => setView('menu')} aria-label="Back to menu" className="rounded-full p-1 text-mute hover:bg-white/10">
                  <BackIcon className="h-4 w-4" />
                </button>
                <p className="font-semibold">Play together</p>
              </div>
              {GAMES.map((g) => (
                <button
                  key={g.id}
                  onClick={() => {
                    call.startGame(g.id);
                    close();
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/10"
                >
                  <span className="text-2xl">{g.emoji}</span>
                  <span>
                    <span className="block text-sm font-semibold">{g.name}</span>
                    <span className="block text-xs text-dim">{g.blurb}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : view === 'boost' ? (
            <div className={`${pos} z-40 w-80 max-w-[90vw] rounded-xl border border-line-2 bg-card-2 p-3 shadow-2xl`}>
              <button onClick={() => setView('menu')} aria-label="Back to menu" className="mb-2 rounded-full p-1 text-mute hover:bg-white/10">
                <BackIcon className="h-4 w-4" />
              </button>
              <BoostCard call={call} buy={call.buyBoost} />
            </div>
          ) : view === 'blocked' ? (
            <div className={`${pos} z-40 max-h-[70dvh] w-80 max-w-[90vw] overflow-y-auto rounded-xl border border-line-2 bg-card-2 p-4 shadow-2xl`}>
              <div className="mb-2 flex items-center gap-2">
                <button onClick={() => setView('menu')} aria-label="Back to menu" className="rounded-full p-1 text-mute hover:bg-white/10">
                  <BackIcon className="h-4 w-4" />
                </button>
                <p className="font-semibold text-[#f4f5f7]">Blocked people</p>
              </div>
              <BlockedList tone="dark" />
            </div>
          ) : view === 'effects' ? (
            <div className={`${pos} z-40 w-80 max-w-[90vw] rounded-xl border border-line-2 bg-card-2 p-4 text-[#f4f5f7] shadow-2xl`}>
              <div className="mb-3 flex items-center gap-2">
                <button onClick={() => setView('menu')} aria-label="Back to menu" className="rounded-full p-1 text-mute hover:bg-white/10">
                  <BackIcon className="h-4 w-4" />
                </button>
                <p className="font-semibold">Face masks & backgrounds</p>
                {call.backgroundBusy && <span className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-sky-300" aria-label="Loading" />}
              </div>
              <EffectsGrid call={call} />
            </div>
          ) : (
            <div className={`${pos} z-40 w-72 max-w-[88vw] rounded-xl bg-card p-4 text-[#f4f5f7] shadow-2xl`}>
              <div className="mb-3 flex items-center gap-2">
                <button onClick={() => setView('menu')} aria-label="Back to menu" className="rounded-full p-1 text-dim hover:bg-card-2">
                  <BackIcon className="h-4 w-4" />
                </button>
                <p className="font-semibold">Settings</p>
              </div>
              <SettingsContent call={call} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
