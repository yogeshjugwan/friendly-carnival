'use client';

import { useEffect, useState } from 'react';
import { MAX_APPEAL_LENGTH } from '@rc/shared';
import { useAuth } from '@/lib/auth';
import type { RandomCall } from '@/lib/useRandomCall';
import { StateActions, StateCard } from './StateCard';

const APPEAL_MAX = Math.min(500, MAX_APPEAL_LENGTH);
const APPEAL_MIN = 20;

function until(expiresAt: number | null): string {
  if (expiresAt === null) return 'Permanent';
  return new Date(expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/** "Appeal suspension": a full-screen dialog with the reason, a 20–500 character note, then "Appeal sent". */
function AppealDialog({ call, reason, onClose }: { call: RandomCall; reason: string; onClose: () => void }) {
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const ok = message.trim().length >= APPEAL_MIN;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label="Appeal your suspension"
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-night p-6 text-[#f4f5f7] sm:bg-[rgba(11,8,17,.96)] sm:p-10"
    >
      <div className="flex w-full max-w-[460px] flex-col gap-3.5 rounded-3xl border border-divider bg-card p-7">
        {sent ? (
          <div role="status" aria-live="polite" className="flex flex-col gap-3.5 text-center">
            <span aria-hidden className="grid h-16 w-16 place-items-center self-center rounded-full bg-pick">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#FF6FAE" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5L19 7" />
              </svg>
            </span>
            <h1 className="m-0 font-display text-[26px] font-bold">Appeal sent</h1>
            <p className="m-0 text-[15px] leading-normal text-[#c9cdd4]">
              A person on our safety team will review it, usually within 24 hours. Your suspension stays in place until then.
            </p>
            <button type="button" autoFocus onClick={onClose} className="flex h-[52px] w-full items-center justify-center rounded-[14px] bg-lime font-display text-base font-bold text-night">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <h1 className="m-0 font-display text-2xl font-bold">Appeal suspension</h1>
              <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 flex-none place-items-center rounded-full bg-[#271f33] text-[#e6e8ec]">
                <CloseIcon />
              </button>
            </div>
            <div className="rounded-xl border border-[#4A2424] bg-[#2A1616] px-3.5 py-3 text-sm text-[#FFD3CE]">
              <span className="text-mute">Reason</span> · {reason}
            </div>
            <label className="flex flex-col gap-1.5 text-[13px] text-mute">
              <span className="flex justify-between">
                Why should we lift it?
                <span>
                  {message.length}/{APPEAL_MAX}
                </span>
              </span>
              <textarea
                autoFocus
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={APPEAL_MAX}
                rows={5}
                placeholder="e.g. My camera showed someone else in the room by mistake…"
                className="resize-none rounded-xl border border-[#6b5d84] bg-night px-3.5 py-3 text-[15px] leading-[1.45] text-[#f4f5f7] placeholder:text-faint"
              />
            </label>
            {!!message && !ok && <p className="-mt-1.5 mb-0 text-xs text-[#FFB3C9]">Write at least {APPEAL_MIN} characters</p>}
            <p className="m-0 text-xs text-mute">One appeal per suspension.</p>
            <button
              type="button"
              disabled={!ok}
              onClick={() => {
                if (!ok) return;
                call.appeal(message);
                setSent(true);
              }}
              className="h-[52px] rounded-[14px] bg-lime font-display text-base font-bold text-night disabled:cursor-not-allowed disabled:bg-line-2 disabled:text-[#8a8f99]"
            >
              Send appeal
            </button>
          </>
        )}
      </div>
    </section>
  );
}

export function BannedScreen({ call }: { call: RandomCall }) {
  const { user, logout } = useAuth();
  const [appealing, setAppealing] = useState(false);
  const ban = call.ban;
  if (!ban) return null;

  return (
    <main className="h-full">
      <StateCard
        icon="ban"
        tone="danger"
        title="Your account is suspended"
        body="You broke our Community Guidelines. Repeat breaks lead to a permanent ban."
      >
        <div className="rounded-[14px] border border-[#4A2424] bg-[#2A1616] px-4 py-3.5 text-left text-sm leading-[1.7] text-[#FFD3CE]">
          <div>
            <span className="text-mute">Reason</span> · {ban.reason}
          </div>
          <div>
            <span className="text-mute">Until</span> · {until(ban.expiresAt)}
            {ban.expiresAt !== null && ' · repeat breaks: permanent'}
          </div>
        </div>

        {ban.appealPending && (
          <p className="m-0 rounded-xl bg-pick px-4 py-3 text-sm text-lime">
            Your appeal was received. A moderator will review it, usually within 24 hours.
          </p>
        )}

        <StateActions
          actions={[
            ...(ban.appealPending ? [] : [{ label: 'Appeal', kind: 'primary' as const, onClick: () => setAppealing(true) }]),
            { label: 'Read the Guidelines', kind: 'outline', href: '/guidelines' },
            ...(user ? [{ label: 'Log out', kind: 'link' as const, onClick: () => void logout() }] : []),
          ]}
        />
      </StateCard>
      {appealing && <AppealDialog call={call} reason={ban.reason} onClose={() => setAppealing(false)} />}
    </main>
  );
}
