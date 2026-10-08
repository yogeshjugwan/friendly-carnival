import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { COUNTRY_PAGES, countryPage, SITE_URL } from '@/lib/countryPages';
import { flagEmoji } from '@/lib/format';

export const dynamicParams = false;

export function generateStaticParams() {
  return COUNTRY_PAGES.map((c) => ({ country: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const c = countryPage((await params).country);
  if (!c) return {};
  const title = `Random Video Chat ${c.name.replace(/^the /, '')} — Talk to Strangers Free | randomCall`;
  const description = `Meet new people in ${c.name} instantly. Free random video, voice and text chat with strangers — no download, no sign-up. Safe, moderated and private.`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/chat/${c.slug}` },
    openGraph: { title, description, url: `${SITE_URL}/chat/${c.slug}`, siteName: 'randomCall', type: 'website' },
  };
}

export default async function CountryChatPage({ params }: { params: Promise<{ country: string }> }) {
  const c = countryPage((await params).country);
  if (!c) notFound();
  const short = c.name.replace(/^the /, '');
  const faq = [
    { q: `Is randomCall free in ${short}?`, a: 'Yes. Video, voice and text chat are free. Plus adds filters (like gender and country) and removes ads.' },
    { q: 'Do I need to sign up?', a: 'No — you can start as a guest. A free account keeps your friends, coins and settings on every device.' },
    { q: 'Is it safe?', a: 'Every chat has report, block and blur tools, automatic nudity screening, a ✓ Verified badge for real people and human moderators. You must be 18 or older.' },
    { q: `Can I meet people only from ${short}?`, a: `Plus members can filter by country and gender. Everyone can pick interests and topic rooms to meet people who like ${c.topics}.` },
  ];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
  return (
    <main className="mx-auto flex min-h-full max-w-4xl flex-col gap-8 px-4 py-6 sm:px-6">
      <SiteHeader />
      <section className="mt-6 text-center">
        <p className="text-6xl" aria-hidden>
          {flagEmoji(c.code)}
        </p>
        <h1 className="mt-4 text-4xl font-bold sm:text-5xl">Random video chat in {short}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-300">
          {c.greeting}! Meet new people from {c.name} and around the world in seconds — free video, voice and text chat right in your
          browser. No download, no sign-up.
        </p>
        <Link href="/" className="mt-6 inline-block rounded-xl bg-brand px-8 py-3.5 text-lg font-semibold text-white hover:bg-brand-dark">
          Start chatting now
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ['🎥', 'Video, voice or text', 'Talk face to face, voice-only, or just type — your choice every time.'],
          ['🌐', 'Any language', `Chat in ${c.languages}. Messages can be translated with one tap.`],
          ['🛡️', 'Safe by design', 'Report, block and blur tools, nudity screening, verified profiles and real moderators.'],
        ].map(([icon, title, text]) => (
          <div key={title} className="rounded-2xl bg-white/5 p-5">
            <p className="text-3xl" aria-hidden>
              {icon}
            </p>
            <h2 className="mt-2 font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-slate-300">{text}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Talk to strangers in {short}</h2>
        <p className="mt-2 text-slate-300">
          randomCall pairs you with someone new every time you press Next. Add interests like {c.topics} to meet people who share them,
          join a topic room, play a quick game together, or add someone as a friend to call them again later.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Questions</h2>
        <dl className="mt-3 space-y-4">
          {faq.map((f) => (
            <div key={f.q}>
              <dt className="font-semibold">{f.q}</dt>
              <dd className="mt-1 text-slate-300">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <nav aria-label="Other countries" className="text-sm text-slate-400">
        <p className="mb-2 font-semibold text-slate-300">Random chat in other countries</p>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          {COUNTRY_PAGES.filter((x) => x.slug !== c.slug).map((x) => (
            <Link key={x.slug} href={`/chat/${x.slug}`} className="hover:text-white">
              {flagEmoji(x.code)} {x.name.replace(/^the /, '')}
            </Link>
          ))}
        </p>
      </nav>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteFooter />
    </main>
  );
}
