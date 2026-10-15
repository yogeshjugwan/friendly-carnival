'use client';

import { useEffect, useState } from 'react';
import type { ReportReason } from '@rc/shared';
import type { RandomCall } from '@/lib/useRandomCall';
import { useFocusTrap } from '@/lib/useFocusTrap';

const REASONS: [ReportReason, string][] = [
  ['nudity', 'Nudity or sexual content'],
  ['underage', 'Looks under 18'],
  ['harassment', 'Hate or harassment'],
  ['illegal', 'Violence or threats'],
  ['scam', 'Spam or scam'],
  ['other', 'Something else'],
];

/**
 * "What happened?" — pick a reason, optionally block, then report and move on.
 * A centred dialog on larger screens, a bottom sheet on phones. The caller hides
 * the partner's video while this is open.
 */
export function ReportDialog({ call, onClose }: { call: RandomCall; onClose: () => void }) {
  const trap = useFocusTrap();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [block, setBlock] = useState(true);
  const [note, setNote] = useState('');
  /** After sending: a confirmation in place of the form (the call has already moved on). */
  const [sent, setSent] = useState<{ blocked: boolean } | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = () => {
    if (!reason) return;
    const target = call.partner ? 'current' : 'previous';
    call.report(target, reason, reason === 'other' ? note : undefined);
    // Blocking also ends the call and looks for someone new; otherwise just skip.
    if (block) call.block(target);
    else if (target === 'current') call.next();
    setSent({ blocked: block });
  };

  return (
    <div className="fixed inset-0 z-[65] text-[#f4f5f7]">
      <div aria-hidden className="absolute inset-0 bg-[rgba(11,8,17,.65)]" onClick={onClose} />
      <p className="absolute inset-x-0 top-6 m-0 text-center text-[13px] text-[#e6e8ec] sm:hidden">Video hidden while you report</p>
      <section ref={trap}
        role="dialog"
        aria-modal="true"
        aria-label={sent ? 'Report sent' : 'Report this person'}
        className="absolute inset-x-0 bottom-0 flex flex-col gap-3.5 rounded-t-3xl border-t border-line bg-card px-5 pb-6 pt-2.5 sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[110px] sm:w-[460px] sm:max-w-[calc(100%-32px)] sm:-translate-x-1/2 sm:rounded-3xl sm:border sm:border-divider sm:p-6 sm:shadow-[0_30px_80px_rgba(0,0,0,.6)]"
      >
        <span aria-hidden className="h-1 w-10 self-center rounded-sm bg-line-2 sm:hidden" />
        {sent ? (
          <div role="status" aria-live="polite" className="flex flex-col gap-3.5 pt-2 text-center">
            <span aria-hidden className="grid h-16 w-16 place-items-center self-center rounded-full bg-pick">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#FF6FAE" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5L19 7" />
              </svg>
            </span>
            <h2 className="m-0 font-display text-2xl font-bold">Report sent</h2>
            <p className="m-0 text-[15px] leading-normal text-[#c9cdd4]">
              Thanks for keeping randomCall safe. Our team reviews reports within 24 hours.
              {sent.blocked ? ' They’re blocked — you won’t be matched or messaged by them again.' : ''}
            </p>
            <button type="button" autoFocus onClick={onClose} className="flex h-[54px] items-center justify-center rounded-2xl bg-lime font-display text-[17px] font-bold text-night">
              Find next person
            </button>
          </div>
        ) : (
          <>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="m-0 font-display text-[22px] font-bold sm:text-2xl">What happened?</h2>
            <p className="m-0 mt-1 text-[13px] text-mute max-sm:hidden">Their video is hidden while you report.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full bg-[#271f33] text-[#e6e8ec]">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div role="radiogroup" aria-label="Reason" className="flex flex-col gap-2">
          {REASONS.map(([value, label]) => {
            const on = value === reason;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setReason(value)}
                className={`flex min-h-[50px] items-center justify-between rounded-[14px] border px-4 text-left text-[15px] font-medium sm:min-h-12 ${on ? 'border-lime bg-pick' : 'border-divider bg-card-2 text-[#e6e8ec]'}`}
              >
                <span>{label}</span>
                <span aria-hidden className={`h-5 w-5 rounded-full ${on ? 'border-[6px] border-lime' : 'border-2 border-[#6b5d84]'}`} />
              </button>
            );
          })}
        </div>
        {reason === 'other' && (
          <label className="flex flex-col gap-1.5 text-[13px] text-mute">
            Tell us what happened (optional)
            <textarea
              rows={3}
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="A few words help our team act faster"
              className="resize-none rounded-xl border border-[#6b5d84] bg-night px-3 py-2.5 text-sm leading-[1.4] text-[#f4f5f7] placeholder:text-faint"
            />
          </label>
        )}
        <label className="flex min-h-11 items-center gap-2.5 text-sm text-[#e6e8ec]">
          <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} className="m-0 h-5 w-5 accent-lime" />
          Also block this person
        </label>
        <button
          type="button"
          disabled={!reason}
          onClick={submit}
          className="h-14 w-full rounded-2xl bg-[#D93A4A] font-display text-[17px] font-bold text-white disabled:cursor-not-allowed disabled:bg-line-2 disabled:text-[#8a8f99] sm:h-[54px]"
        >
          Report &amp; find next
        </button>
          </>
        )}
      </section>
    </div>
  );
}
