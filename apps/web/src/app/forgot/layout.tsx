import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset your password',
  description: 'Forgot your randomCall password? Get a reset link by email.',
  robots: { index: false, follow: true },
  alternates: { canonical: '/forgot' },
  openGraph: { title: 'Reset your password', description: 'Forgot your randomCall password? Get a reset link by email.', url: '/forgot' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
