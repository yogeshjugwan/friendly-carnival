'use client';

import { Brand } from './SiteHeader';
import { SampleWall } from './Landing';

/**
 * Log-in layout from the "Instant entry" design: on desktop a wall of people with the
 * pitch on the left and the form on the right; on phones the logo, a lime glow and the form.
 * `title` is split so its last word can be lime ("Welcome" + "back.").
 */
export function AuthSplit({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-full bg-night text-[#f4f5f7] lg:grid-cols-2">
      <section aria-label="Sample profiles" className="relative m-4 hidden min-h-[420px] overflow-hidden rounded-[28px] lg:block">
        <SampleWall cols={3} tileH={260} />
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,8,17,0)_40%,rgba(11,8,17,.92))]" />
        <span className="absolute right-4 top-4 z-[3] flex h-[26px] items-center rounded-full bg-[rgba(11,8,17,.75)] px-2.5 text-[11px] font-medium text-[#c9cdd4]">
          Sample profiles · illustration
        </span>
        <div className="absolute left-6 top-6 rounded-xl bg-[rgba(11,8,17,.6)] py-1.5 pl-1.5 pr-3.5">
          <Brand />
        </div>
        <div className="absolute inset-x-8 bottom-8">
          <h2 className="m-0 font-display text-[44px] font-bold leading-[1.05] tracking-[-1px]">
            Keep the people
            <br />
            <span className="text-lime">you click with.</span>
          </h2>
          <p className="mb-0 mt-2.5 text-base text-[#c9cdd4]">Follow, message, earn coins and keep your streak.</p>
        </div>
      </section>

      <section className="flex flex-col bg-[radial-gradient(circle_at_50%_0%,#1e0f2a_0%,#0b0811_45%)] px-5 pt-6 pb-7 lg:items-center lg:justify-center lg:bg-none lg:p-12">
        <div className="lg:hidden">
          <Brand compact />
        </div>
        <div className="flex w-full flex-1 flex-col lg:max-w-[400px] lg:flex-none">
          <h1 className="mt-6 mb-1 font-display text-[32px] font-bold leading-[1.05] lg:sr-only">
            {title} <span className="text-lime">{accent}</span>
          </h1>
          {children}
        </div>
      </section>
    </main>
  );
}
