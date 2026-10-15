import Link from 'next/link';
import { ShellLogo } from './AppShell';

export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'support@example.com';
export const UPDATED = '1 October 2026';

type Page = 'terms' | 'guidelines' | 'privacy' | 'help';
const PAGES: [Page, string, string][] = [
  ['terms', 'Terms', '/terms'],
  ['guidelines', 'Guidelines', '/guidelines'],
  ['privacy', 'Privacy', '/privacy'],
  ['help', 'Help', '/help'],
];

export type LegalSection = { title: string; body: React.ReactNode; highlight?: boolean };

const body = 'flex flex-col gap-2 text-sm leading-normal text-[#c9cdd4] [&_a]:text-lime [&_a]:underline [&_li]:mt-1 [&_p]:m-0 [&_strong]:text-[#f4f5f7] [&_ul]:m-0 [&_ul]:list-disc [&_ul]:pl-4';

/** Shared frame for Terms / Guidelines / Privacy / Help: logo, links to the other pages and close on desktop; back + title on phones. */
export function LegalFrame({ current, phoneTitle, phoneSub, children }: { current: Page; phoneTitle: React.ReactNode; phoneSub?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col gap-2.5 bg-night px-4 pb-5 pt-3 text-[#f4f5f7] lg:gap-[18px] lg:px-12 lg:pb-6 lg:pt-4">
      <header className="flex items-center justify-between gap-3 max-lg:hidden">
        <ShellLogo />
        <nav aria-label="Legal and help" className="flex items-center gap-2">
          {PAGES.filter(([p]) => p !== current).map(([p, label, href]) => (
            <Link key={p} href={href} className="flex h-11 items-center rounded-[14px] border border-[#6b5d84] px-[18px] text-sm font-semibold text-[#e6e8ec] hover:border-[#4a3f5c]">
              {label}
            </Link>
          ))}
          <Link href="/" aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full bg-card-2 text-[#e6e8ec]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Link>
        </nav>
      </header>
      <header className="flex items-center gap-1.5 lg:hidden">
        <Link href="/" aria-label="Back" className="grid h-11 w-11 flex-none place-items-center rounded-full text-[#f4f5f7]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <div className="min-w-0">
          <p className="m-0 font-display text-[24px] font-bold" aria-hidden>
            {phoneTitle}
          </p>
          {phoneSub && <p className="m-0 text-[11px] text-mute">{phoneSub}</p>}
        </div>
      </header>
      {children}
    </div>
  );
}

/** Numbered cards on desktop, an accordion on phones (first one open). */
export function LegalSections({ sections, cols = 4 }: { sections: LegalSection[]; cols?: 3 | 4 }) {
  return (
    <>
      <div className={`grid flex-1 content-start gap-3.5 max-lg:hidden ${cols === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {sections.map((s, i) => (
          <article
            key={s.title}
            className={`flex flex-col gap-2.5 rounded-[18px] border p-5 ${s.highlight ? 'border-[#5a2550] bg-[#22111f]' : 'border-line bg-card'}`}
          >
            <span className={`font-display text-[13px] font-bold ${s.highlight ? 'text-lime' : 'text-faint'}`}>{String(i + 1).padStart(2, '0')}</span>
            <h2 className="m-0 font-display text-lg font-bold leading-tight">{s.title}</h2>
            <div className={body}>{s.body}</div>
          </article>
        ))}
      </div>
      <ul className="m-0 flex flex-1 list-none flex-col gap-1.5 p-0 lg:hidden">
        {sections.map((s, i) => (
          <li key={s.title} className={`rounded-[14px] border ${s.highlight ? 'border-[#5a2550] bg-[#22111f]' : 'border-line bg-card'}`}>
            <details open={i === 0} className="group">
              <summary className="flex min-h-[46px] cursor-pointer list-none items-center gap-2.5 px-3 [&::-webkit-details-marker]:hidden">
                <span className={`w-5 flex-none font-display text-xs font-bold ${s.highlight ? 'text-lime' : 'text-faint'}`}>{String(i + 1).padStart(2, '0')}</span>
                <h2 className="m-0 flex-1 text-sm font-semibold">{s.title}</h2>
                <span aria-hidden className="text-lg text-faint transition-transform group-open:rotate-90">
                  ›
                </span>
              </summary>
              <div className={`${body} pb-3 pl-[42px] pr-3 text-[13px] leading-[1.45]`}>{s.body}</div>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}

export const primaryLink = 'flex h-[54px] items-center justify-center rounded-[14px] bg-lime px-7 font-display text-[17px] font-bold text-night lg:h-[52px]';
export const ghostLink =
  'flex h-[52px] items-center justify-center rounded-[14px] border border-[#6b5d84] px-5 text-[15px] font-semibold text-[#e6e8ec] hover:border-[#4a3f5c]';

/** A legal page: big title, subtitle, optional extras on the right, the sections, then a footer line and actions. */
export function LegalPage({
  current,
  title,
  phoneTitle,
  subtitle,
  aside,
  sections,
  footer,
  actions,
  cols = 4,
}: {
  current: Page;
  title: React.ReactNode;
  phoneTitle: string;
  subtitle: string;
  aside?: React.ReactNode;
  sections: LegalSection[];
  footer: React.ReactNode;
  actions?: React.ReactNode;
  cols?: 3 | 4;
}) {
  return (
    <LegalFrame current={current} phoneTitle={phoneTitle} phoneSub={`Updated ${UPDATED}`}>
      <div className="flex flex-wrap items-end justify-between gap-4 max-lg:contents">
        <div className="max-lg:sr-only">
          <h1 className="m-0 font-display text-[40px] font-bold leading-[1.05] tracking-[-1px]">{title}</h1>
          <p className="m-0 mt-1.5 text-sm text-mute">
            {subtitle} Last updated {UPDATED}
          </p>
        </div>
        {aside}
      </div>
      <p className="m-0 self-start rounded-lg bg-gold-bg px-3 py-1.5 text-xs text-gold">
        Template: have this reviewed by a lawyer for your country before a public launch.
      </p>
      <LegalSections sections={sections} cols={cols} />
      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 pt-1 max-lg:flex-col max-lg:items-stretch">
        <p className="m-0 text-[13px] text-mute max-lg:text-center max-lg:text-[11px] [&_a]:text-lime">{footer}</p>
        {actions && <div className="flex gap-2.5 max-lg:flex-col">{actions}</div>}
      </footer>
    </LegalFrame>
  );
}

/** Terms ⇄ Guidelines segmented links (the design's tab switch). */
export function TermsTabs({ current }: { current: 'terms' | 'guidelines' }) {
  const tab = (p: 'terms' | 'guidelines', label: string) => (
    <Link
      href={`/${p}`}
      aria-current={current === p ? 'page' : undefined}
      className={`flex h-11 items-center justify-center rounded-[9px] px-4 text-sm font-semibold ${current === p ? 'bg-pick text-[#f4f5f7] shadow-[inset_0_0_0_1.5px_#FF6FAE]' : 'text-mute hover:text-[#f4f5f7]'}`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Section" className="grid grid-cols-2 gap-1 rounded-xl border border-divider bg-card p-1 lg:flex">
      {tab('terms', 'Terms')}
      {tab('guidelines', 'Guidelines')}
    </nav>
  );
}
