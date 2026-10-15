import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Invite Friends — Get Free Plus',
  description: 'Invite a friend to randomCall and you both get a free day of Plus.',
  alternates: { canonical: '/invite' },
  openGraph: { title: 'Invite Friends — Get Free Plus', description: 'Invite a friend to randomCall and you both get a free day of Plus.', url: '/invite' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
