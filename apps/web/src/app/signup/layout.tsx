import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign up — Free Account',
  description: 'Create a free randomCall account to follow people you click with, message them and earn coins.',
  robots: { index: false, follow: true },
  alternates: { canonical: '/signup' },
  openGraph: { title: 'Sign up — Free Account', description: 'Create a free randomCall account to follow people you click with, message them and earn coins.', url: '/signup' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
