import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { COUNTRY_PAGES, SITE_URL } from '@/lib/countryPages';
import { flagEmoji } from '@/lib/format';

const title = 'Random Video Chat by Country — Talk to Strangers Worldwide';
const description =
  'Pick a country and meet new people there: free random video, voice and text chat with strangers from India, the US, the UK, Brazil and more. No download, no sign-up.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE_URL}/chat` },
  openGraph: { title, description, url: `${SITE_URL}/chat`, siteName: 'randomCall', type: 'website' },
};

/** Index of every country landing page (/chat/<slug>). */
export default function ChatCountriesPage() {
  const sorted = [...COUNTRY_PAGES].sort((a, b) => a.name.replace(/^the /, '').localeCompare(b.name.replace(/^the /, '')));
  return (
    <main className="mx-auto flex min-h-full max-w-4xl flex-col gap-8 px-4 py-6 sm:px-6">
      <SiteHeader />
      <section className="mt-6 text-center">
        <h1 className="m-0 text-4xl font-bold sm:text-5xl">Random video chat by country</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-mute">
          Meet strangers from around the world in seconds. Choose a country to learn more, or just press Start and meet anyone.
        </p>
        <Link href="/" className="mt-6 inline-block rounded-xl bg-lime px-8 py-3.5 text-lg font-semibold text-night hover:bg-lime-hover">
          Start chatting now
        </Link>
      </section>
      <section aria-labelledby="countries-h">
        <h2 id="countries-h" className="mb-4 text-2xl font-bold">
          Countries
        </h2>
        <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 sm:grid-cols-3">
          {sorted.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/chat/${c.slug}`}
                className="flex min-h-11 items-center gap-2.5 rounded-[14px] border border-line bg-card px-3.5 py-2.5 hover:border-lime"
              >
                <span aria-hidden className="text-2xl">
                  {flagEmoji(c.code)}
                </span>
                <span className="min-w-0">
                  <strong className="block truncate text-[15px]">{c.name.replace(/^the /, '')}</strong>
                  <span className="block truncate text-xs text-mute">{c.languages}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <SiteFooter />
    </main>
  );
}
