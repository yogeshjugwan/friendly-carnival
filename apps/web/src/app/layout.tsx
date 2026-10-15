import type { Metadata, Viewport } from 'next';
import { DM_Sans, Space_Grotesk } from 'next/font/google';
import { PwaSetup } from '@/components/Pwa';
import { AuthProvider } from '@/lib/auth';
import './globals.css';
import { AgeGate } from '@/components/AgeGate';
import { GoogleReturn } from '@/components/GoogleReturn';
import { I18nProvider } from '@/lib/i18n';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://call-random-call.vercel.app').replace(/\/$/, '');
const DESCRIPTION =
  'Free random video chat with strangers — meet new people in 3 seconds, right in your browser. No download, no sign-up. Video, voice or text chat with face masks, gifts and 1-tap report & block.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: 'randomCall — Free Random Video Chat with Strangers',
    template: '%s · randomCall',
  },
  description: DESCRIPTION,
  keywords: [
    'random video chat',
    'video chat with strangers',
    'talk to strangers',
    'free video chat',
    'omegle alternative',
    'chatroulette alternative',
    'random chat',
    'meet new people online',
    'cam chat',
    'stranger chat app',
  ],
  applicationName: 'randomCall',
  category: 'social',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'randomCall',
    url: '/',
    title: 'randomCall — Free Random Video Chat with Strangers',
    description: DESCRIPTION,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'randomCall — Free Random Video Chat with Strangers',
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } },
  appleWebApp: { capable: true, title: 'randomCall', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: '#0b0811' };

/** Space Grotesk for headings, the wordmark and big buttons; DM Sans for everything else. */
const display = Space_Grotesk({ subsets: ['latin'], weight: ['500', '700'], variable: '--font-space', display: 'swap' });
const sans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-dmsans', display: 'swap' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <head>
        {/* Chrome may offer "install" before the app's JS loads; keep the event for the Install button. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__rcInstall=e;dispatchEvent(new Event('rc:installable'))});",
          }}
        />
      </head>
      <body className="antialiased">
        <I18nProvider>
          <AuthProvider>
            {children}
            <AgeGate />
          </AuthProvider>
        </I18nProvider>
        <PwaSetup />
        <GoogleReturn />
      </body>
    </html>
  );
}
