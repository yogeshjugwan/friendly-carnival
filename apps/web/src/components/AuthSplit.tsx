'use client';

import { Brand } from './SiteHeader';
import { SKINS, TILE_COLORS, useFaces } from './Landing';

/** Which tile colours fill the 3×3 wall on the left. */
const WALL = [0, 1, 2, 3, 4, 5, 2, 0, 4];

/** Still 3×3 wall of people behind the desktop pitch. */
function PeopleWall() {
  const faces = useFaces();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-3.5 p-3.5 opacity-90">
        {WALL.map((c, i) => {
          const [bg, fg] = TILE_COLORS[c]!;
          const face = faces.length ? faces[(i * 5) % faces.length] : null;
          return (
            <div key={i} className="relative overflow-hidden rounded-[18px]" style={{ background: bg }}>
              {face ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={face} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <svg viewBox="0 0 100 80" preserveAspectRatio="xMidYMax meet" className="absolute inset-x-0 bottom-0 h-4/5 w-full">
                  <path d="M12 80c4-22 18-32 38-32s34 10 38 32z" fill={fg} />
                  <circle cx="50" cy="30" r="15" fill={SKINS[(c * 2) % SKINS.length]} />
                </svg>
              )}
            </div>
          );
        })}
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,8,11,.2),rgba(7,8,11,.9)_85%)]" />
    </div>
  );
}

/**
 * Log-in layout from the "Instant entry" design: on desktop a wall of people with the
 * pitch on the left and the form on the right; on phones the logo, a lime glow and the form.
 * `title` is split so its last word can be lime ("Welcome" + "back.").
 */
export function AuthSplit({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-full bg-night text-[#f4f5f7] lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-tabbar p-12 lg:flex">
        <PeopleWall />
        <div className="relative">
          <Brand />
        </div>
        <div className="relative">
          <h2 className="m-0 font-display text-5xl font-bold leading-[1.05] tracking-[-0.02em]">
            Keep your friends,
            <br />
            <span className="text-lime">coins and Plus.</span>
          </h2>
          <p className="mt-3 mb-0 text-mute">Log in to message people you met and keep your streak.</p>
        </div>
      </section>

      <section className="flex flex-col bg-[radial-gradient(circle_at_50%_0%,#1a2410_0%,#07080b_45%)] px-5 pt-6 pb-7 lg:items-center lg:justify-center lg:bg-none lg:p-12">
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
