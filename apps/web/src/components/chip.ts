/** Small action chip on the partner card (Friend / Gift / Play). */
export const CHIP =
  'inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-line-2 bg-card-2 px-2.5 text-xs font-semibold text-[#e8ebf2] transition hover:bg-[#262c3b] focus:outline-none focus-visible:ring-2 focus-visible:ring-lime/60 disabled:cursor-not-allowed disabled:opacity-50';

/** Where a chip's menu opens: below it, or above it on larger screens when the card sits at the bottom of the video. */
export const popPos = (up?: boolean) => (up ? 'top-full mt-2 sm:bottom-full sm:top-auto sm:mb-2 sm:mt-0' : 'top-full mt-2');

/** Menu panel opened from a chip. */
export const POP = 'absolute left-0 z-40 max-w-[85vw] rounded-xl border border-line bg-card text-slate-100 shadow-2xl';
