import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Group Video Chat Rooms — Talk to up to 4 People',
  description: 'Join a free group video chat room with up to 4 strangers. Pick a topic, jump in and meet new people together — right in your browser.',
  alternates: { canonical: '/rooms' },
  openGraph: { title: 'Group Video Chat Rooms — Talk to up to 4 People', description: 'Join a free group video chat room with up to 4 strangers. Pick a topic, jump in and meet new people together — right in your browser.', url: '/rooms' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
