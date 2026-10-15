import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { SITE_URL } from '@/lib/countryPages';
import { LANDING_PAGES, type LandingPage } from '@/lib/landingPages';

export function landingMetadata(p: LandingPage): Metadata {
  const url = `${SITE_URL}/${p.slug}`;
  return {
    title: p.title,
    description: p.description,
    alternates: { canonical: url },
    openGraph: { title: p.title, description: p.description, url, siteName: 'randomCall', type: 'website' },
  };
}

/** Server-rendered search landing page (Omegle / Chatroulette alternative, …). */
export function SeoLanding({ page }: { page: LandingPage }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
  return (
    <main className="mx-auto flex min-h-full max-w-4xl flex-col gap-8 px-4 py-6 sm:px-6">
      <SiteHeader />
      <section className="mt-6 text-center">
        <h1 className="font-display text-4xl font-bold sm:text-5xl">{page.h1}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-mute">{page.intro}</p>
        <Link href="/" className="mt-6 inline-block rounded-xl bg-lime px-8 py-3.5 text-lg font-semibold text-night hover:bg-lime-hover">
          Start chatting now
        </Link>
      </section>

      {page.sections.map((s) => (
        <section key={s.h2}>
          <h2 className="font-display text-2xl font-semibold">{s.h2}</h2>
          {s.paras.map((para) => (
            <p key={para.slice(0, 32)} className="mt-2 leading-relaxed text-mute">
              {para}
            </p>
          ))}
        </section>
      ))}

      <section>
        <h2 className="font-display text-2xl font-semibold">Questions</h2>
        <dl className="mt-3 space-y-4">
          {page.faq.map((f) => (
            <div key={f.q}>
              <dt className="font-semibold">{f.q}</dt>
              <dd className="mt-1 text-mute">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="text-center">
        <Link href="/" className="inline-block rounded-xl bg-lime px-8 py-3.5 text-lg font-semibold text-night hover:bg-lime-hover">
          Meet someone new
        </Link>
      </section>

      <nav aria-label="More about randomCall" className="text-sm text-dim">
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          {LANDING_PAGES.filter((x) => x.slug !== page.slug).map((x) => (
            <Link key={x.slug} href={`/${x.slug}`} className="hover:text-white">
              {x.h1}
            </Link>
          ))}
          <Link href="/guidelines" className="hover:text-white">
            Community guidelines
          </Link>
        </p>
      </nav>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteFooter />
    </main>
  );
}
