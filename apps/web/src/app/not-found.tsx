import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-full max-w-4xl flex-col gap-8 px-4 py-6 sm:px-6">
      <SiteHeader />
      <section className="my-auto flex flex-col items-center gap-4 py-16 text-center">
        <span aria-hidden className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#FF6FAE1F] text-lime">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </svg>
        </span>
        <p className="m-0 font-display text-sm font-bold uppercase tracking-widest text-lime">404</p>
        <h1 className="m-0 font-display text-[30px] font-bold leading-tight text-[#f4f5f7] sm:text-4xl">This page skipped to someone new</h1>
        <p className="m-0 max-w-md text-base leading-normal text-mute">The link may be old or mistyped. Head back home and meet someone in a few seconds.</p>
        <div className="mt-2 flex w-full max-w-sm flex-col gap-2.5 sm:flex-row">
          <Link href="/" className="flex h-[52px] flex-1 items-center justify-center rounded-[14px] bg-lime font-display text-base font-bold text-night hover:bg-lime-hover">
            Start chatting
          </Link>
          <Link href="/help" className="flex h-[52px] flex-1 items-center justify-center rounded-[14px] border-[1.5px] border-[#6b5d84] text-[15px] font-semibold text-[#e6e8ec] hover:border-[#8a7aa6]">
            Get help
          </Link>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
