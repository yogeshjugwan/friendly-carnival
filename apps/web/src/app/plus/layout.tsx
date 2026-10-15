import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'randomCall Plus — Gender & Country Filters',
  description: 'Get randomCall Plus: choose who you meet by gender and country, see who is online, no ads and a Plus badge. Cancel anytime.',
  alternates: { canonical: '/plus' },
  openGraph: { title: 'randomCall Plus — Gender & Country Filters', description: 'Get randomCall Plus: choose who you meet by gender and country, see who is online, no ads and a Plus badge. Cancel anytime.', url: '/plus' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
