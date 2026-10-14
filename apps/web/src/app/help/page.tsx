import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT_EMAIL, LegalFrame } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Troubleshooting & help — randomCall' };

/** `k`: extra search words. */
const FAQ: { q: string; k: string; a: React.ReactNode }[] = [
  {
    q: 'The camera or microphone does not work',
    k: 'camera mic microphone permission allow device',
    a: (
      <ul>
        <li>Click the camera / lock icon next to the address bar and set Camera and Microphone to <b>Allow</b>, then reload.</li>
        <li>Close other apps that use the camera (Zoom, Meet, FaceTime, Teams) and try again.</li>
        <li>In a call, open <b>⋮ → Settings</b> (or the small ^ next to the mic and camera) to pick a different device.</li>
        <li>On a Mac: System Settings → Privacy &amp; Security → Camera / Microphone → allow your browser.</li>
      </ul>
    ),
  },
  {
    q: 'I see the stranger but they cannot see me (or the reverse)',
    k: 'camera video relay network black',
    a: (
      <ul>
        <li>Check that your camera button is not red (red = off).</li>
        <li>Some office, school and mobile networks block direct video. randomCall then switches to <b>Relay mode</b> automatically, with a short delay.</li>
        <li>Try another network (for example Wi-Fi instead of mobile data), or press Next.</li>
      </ul>
    ),
  },
  {
    q: '“Connecting…” never finishes',
    k: 'connecting loading stuck relay server browser',
    a: (
      <ul>
        <li>Wait about 15 seconds: if a direct connection fails, the call switches to Relay mode.</li>
        <li>Reload the page. The free server can take up to a minute to wake up after a quiet period.</li>
        <li>Use Chrome, Edge, Firefox or Safari, updated to the latest version.</li>
      </ul>
    ),
  },
  {
    q: 'No sound',
    k: 'sound audio mute volume hear',
    a: (
      <ul>
        <li>Check the stranger is not muted on their side, and your device volume is up.</li>
        <li>Click anywhere on the page once — some browsers block sound until you interact with the page.</li>
      </ul>
    ),
  },
  {
    q: 'Someone is breaking the rules',
    k: 'report block safety ban abuse',
    a: (
      <ul>
        <li>Use <b>🛡 Safety</b> on the video, or <b>⋮ → Report abuse</b>, to report or block them. Press Next to leave straight away.</li>
        <li>Blocked people are never matched with you again.</li>
      </ul>
    ),
  },
  {
    q: 'Plus, payments and matches',
    k: 'plus payment coins matches subscription cancel refund',
    a: (
      <ul>
        <li>Free users get a number of matches per day; watching a short video adds more. Plus is unlimited.</li>
        <li>Manage or cancel Plus in <b>Settings → Manage subscription</b>.</li>
      </ul>
    ),
  },
];

const contact = 'flex min-h-11 items-center gap-3 rounded-2xl bg-card-2 p-3.5 text-[#f4f5f7]';
const icon = 'grid h-10 w-10 flex-none place-items-center rounded-xl';

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const faqs = words.length ? FAQ.filter((f) => words.every((w) => `${f.q} ${f.k}`.toLowerCase().includes(w))) : FAQ;

  return (
    <LegalFrame
      current="help"
      phoneTitle={
        <>
          How can we <span className="text-lime">help?</span>
        </>
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2.5">
        <h1 className="m-0 font-display text-[40px] font-bold leading-[1.05] tracking-[-1px] max-lg:sr-only">
          How can we <span className="text-lime">help?</span>
        </h1>
        <form role="search" action="/help" className="relative flex w-full lg:max-w-[520px] lg:flex-[0_1_520px]">
          <label htmlFor="help-q" className="sr-only">
            Search help
          </label>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8A8F99" strokeWidth={2} aria-hidden className="absolute left-3.5 top-[15px] lg:left-4 lg:top-[17px]">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </svg>
          <input
            id="help-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search: camera, sound, report…"
            className="h-12 min-w-0 flex-1 rounded-[14px] border border-line-2 bg-card pl-[42px] pr-3.5 text-[15px] text-[#f4f5f7] outline-none placeholder:text-faint focus:border-lime lg:h-[52px] lg:pl-11 lg:pr-4"
          />
        </form>
      </div>

      <div className="grid flex-1 content-start items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-label="Common questions" className="flex flex-col gap-3">
          {q && (
            <p className="m-0 text-sm text-mute">
              {faqs.length ? `Results for “${q}”` : `Nothing found for “${q}”.`}{' '}
              <Link href="/help" className="font-semibold text-lime">
                Show all
              </Link>
            </p>
          )}
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 lg:gap-2">
            {faqs.map((f, i) => (
              <li key={f.q} className="rounded-[14px] border border-line bg-card lg:rounded-2xl">
                <details open={i === 0} className="group">
                  <summary className="flex min-h-[50px] cursor-pointer list-none items-center justify-between gap-3 px-3.5 text-sm font-semibold lg:min-h-14 lg:px-[18px] lg:text-base [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span aria-hidden className="text-xl text-faint transition-transform group-open:rotate-90">
                      ›
                    </span>
                  </summary>
                  <div className="px-3.5 pb-3.5 text-[13px] leading-normal text-[#c9cdd4] lg:px-[18px] lg:pb-4 lg:text-sm [&_b]:text-[#f4f5f7] [&_li]:mt-1 [&_ul]:m-0 [&_ul]:list-disc [&_ul]:pl-5">
                    {f.a}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>

        <aside className="flex flex-col gap-3">
          <section className="flex flex-col gap-2.5 rounded-[18px] border border-line bg-card p-4 lg:rounded-[20px] lg:p-[18px]">
            <h2 className="m-0 mb-1 font-display text-lg font-bold">Still stuck?</h2>
            <a href={`mailto:${CONTACT_EMAIL}`} className={contact}>
              <span className={`${icon} bg-pick text-lime`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M3 7l9 6 9-6" />
                </svg>
              </span>
              <span className="min-w-0">
                <strong className="block">Email us</strong>
                <span className="block break-all text-xs text-mute">{CONTACT_EMAIL} · tell us your browser, device and what you see</span>
              </span>
            </a>
            <div className={contact}>
              <span className={`${icon} bg-gold-bg text-gold`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
                </svg>
              </span>
              <span className="min-w-0">
                <strong className="block">Appeal a ban</strong>
                <span className="block text-xs text-mute">Bans can be appealed from the ban screen</span>
              </span>
            </div>
          </section>
          <section className="rounded-[14px] border border-[#4a2424] bg-[#2a1616] px-3.5 py-3 text-xs leading-normal text-[#ffd3ce] lg:rounded-[20px] lg:px-[18px] lg:py-4 lg:text-[13px]">
            <strong className="block font-display text-[15px] text-stop-text">Safety emergency?</strong>
            If someone is in danger, contact local emergency services first. Then use 🛡 Safety in the call to report them.
          </section>
          <p className="m-0 text-center text-[11px] text-mute lg:hidden">
            <Link href="/terms" className="text-lime">
              Terms
            </Link>{' '}
            ·{' '}
            <Link href="/guidelines" className="text-lime">
              Guidelines
            </Link>{' '}
            ·{' '}
            <Link href="/privacy" className="text-lime">
              Privacy
            </Link>
          </p>
        </aside>
      </div>
    </LegalFrame>
  );
}
