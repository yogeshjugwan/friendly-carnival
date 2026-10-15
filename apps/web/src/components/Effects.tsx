'use client';

import { useState } from 'react';
import { BACKGROUND_OPTIONS } from '@/lib/backgroundEffect';
import { LENSES, MASK_OPTIONS } from '@/lib/faceMask';
import type { RandomCall } from '@/lib/useRandomCall';

/** The background picker: No effect, blur levels and virtual backgrounds. */
export function EffectsGrid({ call }: { call: RandomCall }) {
  return (
    <>
      {(
        [
          ['Lenses', MASK_OPTIONS.filter((o) => o.kind === 'none' || LENSES.includes(o.kind))],
          ['Full masks', MASK_OPTIONS.filter((o) => o.kind !== 'none' && !LENSES.includes(o.kind))],
        ] as const
      ).map(([title, opts]) => (
        <div key={title}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-mute">{title}</p>
          <div className="mb-4 grid grid-cols-4 gap-2" role="radiogroup" aria-label={title}>
            {opts.map((o) => {
              const active = call.faceMask === o.kind;
              return (
                <button
                  key={o.kind}
                  role="radio"
                  aria-checked={active}
                  disabled={call.backgroundBusy}
                  onClick={() => void call.setFaceMask(o.kind)}
                  title={o.label}
                  className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border-2 bg-card-2 text-[10px] leading-tight text-white transition disabled:opacity-50 ${
                    active ? 'border-lime' : 'border-transparent hover:border-white/30'
                  }`}
                >
                  <span className="text-2xl" aria-hidden>
                    {o.emoji}
                  </span>
                  <span className="font-medium">{o.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-mute">Background</p>
      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Background">
        {BACKGROUND_OPTIONS.map((o) => {
          const active = call.background === o.mode;
          return (
            <button
              key={o.mode}
              role="radio"
              aria-checked={active}
              disabled={call.backgroundBusy}
              onClick={() => void call.setBackground(o.mode)}
              title={o.label}
              className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 text-[10px] leading-tight transition disabled:opacity-50 ${
                active ? 'border-lime' : 'border-transparent hover:border-white/30'
              }`}
              style={{ background: o.swatch === 'transparent' ? '#3c4043' : o.swatch }}
            >
              <span className="text-lg" aria-hidden>
                {o.mode === 'none' ? '⊘' : o.mode === 'slight-blur' ? '◌' : o.mode === 'blur' ? '◉' : ''}
              </span>
              <span className="px-0.5 text-center font-medium text-white drop-shadow">{o.label}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-dim">Masks follow your face, blink and talk with you. Everything runs on your device; the first time takes a few seconds to load.</p>
    </>
  );
}

const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />
    <path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
  </svg>
);

/** ✨ "Apply visual effects" button for the call bar, like Meet's. */
export function EffectsButton({ call, className }: { call: RandomCall; className: string }) {
  const [open, setOpen] = useState(false);
  const on = call.background !== 'none' || call.faceMask !== 'none';
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Backgrounds and effects"
        aria-expanded={open}
        title="Backgrounds and effects"
        className={`${className} ${on ? '!bg-lime !text-night' : ''}`}
      >
        <SparkleIcon />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute bottom-full left-1/2 z-40 mb-3 w-80 max-w-[90vw] -translate-x-1/2 rounded-xl bg-[#2a2b2e] p-4 text-[#f4f5f7] shadow-2xl">
            <div className="mb-3 flex items-center gap-2">
              <p className="font-semibold">Backgrounds and effects</p>
              {call.backgroundBusy && <span className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-sky-300" aria-label="Loading" />}
            </div>
            <EffectsGrid call={call} />
          </div>
        </>
      )}
    </div>
  );
}
