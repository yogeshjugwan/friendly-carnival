'use client';

import { useState } from 'react';
import { MAX_REPORT_NOTE_LENGTH, type ReportReason } from '@rc/shared';
import type { RandomCall } from '@/lib/useRandomCall';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'nudity', label: 'Nudity or sexual content' },
  { value: 'harassment', label: 'Harassment or hate' },
  { value: 'underage', label: 'Underage user' },
  { value: 'scam', label: 'Scam or spam' },
  { value: 'illegal', label: 'Illegal activity' },
  { value: 'other', label: 'Other' },
];

type Step = 'closed' | 'menu' | 'target' | 'reason' | 'done';

/** Shield button on the partner's video: hide video, block, report. */
export function SafetyMenu({ call }: { call: RandomCall }) {
  const [step, setStep] = useState<Step>('closed');
  const [target, setTarget] = useState<'current' | 'previous'>('current');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const hasCurrent = !!call.partner;
  const hidden = call.partnerHidden || call.aiHidden;

  const close = () => {
    setStep('closed');
    setReason(null);
    setNote('');
  };

  const startReport = () => {
    if (hasCurrent && call.canGoBack) setStep('target');
    else {
      setTarget(hasCurrent ? 'current' : 'previous');
      setStep('reason');
    }
  };

  return (
    <>
      <button
        onClick={() => setStep(step === 'closed' ? 'menu' : 'closed')}
        aria-label="Safety options"
        aria-expanded={step !== 'closed'}
        className="rounded-full bg-black/55 px-2.5 py-1 text-sm font-medium text-white hover:bg-black/70 sm:px-3 sm:py-1.5"
      >
        🛡<span className="hidden sm:inline"> Safety</span>
      </button>

      {step === 'menu' && (
        <div className="absolute right-2 top-12 z-20 w-56 overflow-hidden rounded-xl bg-white text-sm text-ink shadow-xl">
          {hasCurrent && (
            <button className="block w-full px-4 py-3 text-left hover:bg-slate-100" onClick={() => (call.togglePartnerHidden(), close())}>
              {hidden ? 'Show partner video' : 'Hide partner video'}
            </button>
          )}
          {hasCurrent && (
            <button className="block w-full px-4 py-3 text-left text-red-700 hover:bg-red-50" onClick={() => (call.block('current'), close())}>
              Block user
            </button>
          )}
          <button
            className="block w-full px-4 py-3 text-left text-amber-800 hover:bg-amber-50 disabled:opacity-40"
            disabled={!hasCurrent && !call.canGoBack}
            onClick={startReport}
          >
            Report user
          </button>
        </div>
      )}

      {(step === 'target' || step === 'reason' || step === 'done') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Report user">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 text-ink shadow-2xl">
            {step === 'target' && (
              <>
                <h2 className="text-lg font-semibold">Who do you want to report?</h2>
                <div className="mt-4 space-y-2">
                  <button
                    className="block w-full rounded-lg border border-slate-200 px-4 py-3 text-left hover:bg-slate-50"
                    onClick={() => (setTarget('current'), setStep('reason'))}
                  >
                    <span className="font-medium">Current partner</span>
                    <span className="block text-sm text-slate-500">The person you are viewing now</span>
                  </button>
                  <button
                    className="block w-full rounded-lg border border-slate-200 px-4 py-3 text-left hover:bg-slate-50"
                    onClick={() => (setTarget('previous'), setStep('reason'))}
                  >
                    <span className="font-medium">Previous partner</span>
                    <span className="block text-sm text-slate-500">The person you just skipped</span>
                  </button>
                </div>
              </>
            )}

            {step === 'reason' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!reason) return;
                  call.report(target, reason, note);
                  setStep('done');
                }}
              >
                <h2 className="text-lg font-semibold">Why are you reporting {target === 'current' ? 'this person' : 'your previous partner'}?</h2>
                <div className="mt-4 grid gap-2">
                  {REASONS.map((r) => (
                    <label
                      key={r.value}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 ${
                        reason === r.value ? 'border-brand bg-blue-50' : 'border-slate-200'
                      }`}
                    >
                      <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
                      {r.label}
                    </label>
                  ))}
                </div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={MAX_REPORT_NOTE_LENGTH}
                  placeholder="Anything else we should know? (optional)"
                  className="mt-3 h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-slate-500">A still image of their video is attached so a moderator can review it.</p>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={close} className="rounded-lg px-4 py-2 font-medium hover:bg-slate-100">
                    Cancel
                  </button>
                  <button type="submit" disabled={!reason} className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white disabled:opacity-40">
                    Submit report
                  </button>
                </div>
              </form>
            )}

            {step === 'done' && (
              <>
                <h2 className="text-lg font-semibold">Report sent</h2>
                <p className="mt-2 text-slate-600">
                  Thanks for helping keep randomCall safe. You won&apos;t be matched with this person again.
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button onClick={close} className="rounded-lg px-4 py-2 font-medium hover:bg-slate-100">
                    Done
                  </button>
                  <button
                    onClick={() => {
                      close();
                      call.next();
                    }}
                    className="rounded-lg bg-brand px-4 py-2 font-semibold text-white"
                  >
                    Find a new match
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
