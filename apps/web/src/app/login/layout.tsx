import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Log in or Sign up',
  description: 'Log in to randomCall to keep your friends, messages, coins and streak — or chat as a guest with no sign-up.',
  alternates: { canonical: '/login' },
  openGraph: { title: 'Log in or Sign up', description: 'Log in to randomCall to keep your friends, messages, coins and streak — or chat as a guest with no sign-up.', url: '/login' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
