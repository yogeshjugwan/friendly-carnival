import type { Metadata, Viewport } from 'next';
import { PwaSetup } from '@/components/Pwa';
import { AuthProvider } from '@/lib/auth';
import './globals.css';
import { AgeGate } from '@/components/AgeGate';
import { I18nProvider } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'randomCall — Random video chat with strangers',
  description: 'Meet someone new in seconds. Free one-on-one random video chat, right in your browser.',
  applicationName: 'randomCall',
  appleWebApp: { capable: true, title: 'randomCall', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' },
};

export const viewport: Viewport = { themeColor: '#0b1424' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
      </body>
    </html>
  );
}
