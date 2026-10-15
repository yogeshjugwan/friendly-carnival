'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

/** Icon paths from the state-screen design (24×24, stroke). */
export const STATE_ICONS = {
  face: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 10h.01M15 10h.01M9 15c1.5 1.5 4.5 1.5 6 0" />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2 2M9 2h6" />
    </>
  ),
  camOff: <path d="M2 2l20 20M16 16H4a2 2 0 01-2-2V8a2 2 0 012-2h2M10 6h4a2 2 0 012 2v4l6-3v10" />,
  crown: <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" />,
} as const;

const TONES = {
  purple: 'bg-[#A36BFF1F] text-[#A36BFF]',
  danger: 'bg-[#FF8A801F] text-stop-text',
  pink: 'bg-[#FF6FAE1F] text-lime',
  gold: 'bg-[#F2C94C1F] text-gold',
} as const;

/**
 * The shared state screen: a full-screen, bottom-anchored layout on phones and a
 * centred 500px card on larger screens.
 */
export function StateCard({
  icon,
  tone,
  title,
  titleId,
  body,
  children,
  overlay = false,
}: {
  icon: keyof typeof STATE_ICONS;
  tone: keyof typeof TONES;
  title: ReactNode;
  titleId?: string;
  body?: ReactNode;
  children?: ReactNode;
  /** Fixed over the page (dialog) instead of filling its container. */
  overlay?: boolean;
}) {
  return (
    <div
      className={`${overlay ? 'fixed inset-0 z-50' : 'relative h-full min-h-full'} flex flex-col overflow-y-auto bg-night bg-[radial-gradient(ellipse_60%_50%_at_50%_30%,#1E0F2A_0%,#0B0811_70%)] px-5 pb-7 pt-24 text-[#f4f5f7] sm:items-center sm:justify-center sm:p-6`}
      {...(overlay ? { role: 'dialog', 'aria-modal': true, 'aria-labelledby': titleId } : {})}
    >
      <section className="mt-auto flex w-full flex-col gap-3.5 sm:my-auto sm:max-w-[500px] sm:gap-4 sm:rounded-[26px] sm:border sm:border-divider sm:bg-[rgba(23,18,31,.94)] sm:p-8 sm:shadow-[0_30px_80px_rgba(0,0,0,.55)]">
        <span aria-hidden className={`flex h-[72px] w-[72px] items-center justify-center self-center rounded-full ${TONES[tone]}`}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            {STATE_ICONS[icon]}
          </svg>
        </span>
        <h1 id={titleId} className="m-0 text-center font-display text-[26px] font-bold leading-[1.15] sm:text-[30px]">
          {title}
        </h1>
        {body && <p className="m-0 text-center text-base leading-normal text-mute">{body}</p>}
        {children}
      </section>
    </div>
  );
}

const BTN = 'flex h-[52px] w-full items-center justify-center rounded-[14px] font-display text-base font-bold disabled:opacity-50';
const KIND = {
  primary: `${BTN} bg-lime text-night`,
  outline: `${BTN} border-[1.5px] border-[#6b5d84] bg-transparent font-sans font-semibold text-[#e6e8ec] hover:border-[#8a7aa6]`,
  danger: `${BTN} bg-[#D93A4A] text-white`,
  gold: `${BTN} bg-gold text-[#1A1404] hover:brightness-110`,
  link: 'flex h-11 w-full items-center justify-center text-sm font-semibold text-mute underline hover:text-white',
} as const;

export type StateAction = { label: ReactNode; kind: keyof typeof KIND; onClick?: () => void; href?: string; disabled?: boolean; type?: 'submit' };

/** The stacked button column under a state card. */
export function StateActions({ actions }: { actions: StateAction[] }) {
  return (
    <div className="mt-1 flex flex-col gap-2.5">
      {actions.map((a, i) =>
        a.href ? (
          <Link key={i} href={a.href} className={KIND[a.kind]}>
            {a.label}
          </Link>
        ) : (
          <button key={i} type={a.type ?? 'button'} onClick={a.onClick} disabled={a.disabled} className={KIND[a.kind]}>
            {a.label}
          </button>
        ),
      )}
    </div>
  );
}
