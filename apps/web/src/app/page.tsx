import { RandomCall } from '@/components/RandomCall';
import { HOME_FAQ } from '@/lib/seo';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://call-random-call.vercel.app').replace(/\/$/, '');

export default function Home() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'randomCall',
      url: SITE,
      applicationCategory: 'SocialNetworkingApplication',
      operatingSystem: 'Any (web browser)',
      description: 'Free random video chat with strangers in your browser. No download, no sign-up.',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
    { '@context': 'https://schema.org', '@type': 'Organization', name: 'randomCall', url: SITE, logo: `${SITE}/icon-192.png` },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: HOME_FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <RandomCall />
    </>
  );
}
