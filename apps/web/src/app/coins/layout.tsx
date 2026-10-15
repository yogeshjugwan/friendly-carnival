import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Coins — Send Gifts & Boost',
  description: 'Buy coins to send gifts in video chats and Boost your profile to get matched first on randomCall.',
  alternates: { canonical: '/coins' },
  openGraph: { title: 'Coins — Send Gifts & Boost', description: 'Buy coins to send gifts in video chats and Boost your profile to get matched first on randomCall.', url: '/coins' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
