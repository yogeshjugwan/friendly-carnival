import type { Metadata } from 'next';
import { CONTACT_EMAIL } from '@/components/LegalPage';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';

export const metadata: Metadata = { title: 'Troubleshooting & help — randomCall' };

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: 'The camera or microphone does not work',
    a: (
      <ul>
        <li>Click the camera / lock icon next to the address bar and set Camera and Microphone to <b>Allow</b>, then reload.</li>
        <li>Close other apps that use the camera (Zoom, Meet, FaceTime, Teams) and try again.</li>
        <li>In a call, open <b>⋮ → Settings</b> (or the small ^ next to the mic and camera) to pick a different device.</li>
        <li>On a Mac: System Settings → Privacy &amp; Security → Camera / Microphone → allow your browser.</li>
      </ul>
    ),
  },
  {
    q: 'I see the stranger but they cannot see me (or the reverse)',
    a: (
      <ul>
        <li>Check that your camera button is not red (red = off).</li>
        <li>Some office, school and mobile networks block direct video. randomCall then switches to <b>Relay mode</b> automatically, with a short delay.</li>
        <li>Try another network (for example Wi-Fi instead of mobile data), or press Next.</li>
      </ul>
    ),
  },
  {
    q: '“Connecting…” never finishes',
    a: (
      <ul>
        <li>Wait about 15 seconds: if a direct connection fails, the call switches to Relay mode.</li>
        <li>Reload the page. The free server can take up to a minute to wake up after a quiet period.</li>
        <li>Use Chrome, Edge, Firefox or Safari, updated to the latest version.</li>
      </ul>
    ),
  },
  {
    q: 'No sound',
    a: (
      <ul>
        <li>Check the stranger is not muted on their side, and your device volume is up.</li>
        <li>Click anywhere on the page once — some browsers block sound until you interact with the page.</li>
      </ul>
    ),
  },
  {
    q: 'Someone is breaking the rules',
    a: (
      <ul>
        <li>Use <b>🛡 Safety</b> on the video, or <b>⋮ → Report abuse</b>, to report or block them. Press Next to leave straight away.</li>
        <li>Blocked people are never matched with you again.</li>
      </ul>
    ),
  },
  {
    q: 'Plus, payments and matches',
    a: (
      <ul>
        <li>Free users get a number of matches per day; watching a short video adds more. Plus is unlimited.</li>
        <li>Manage or cancel Plus in <b>Settings → Manage subscription</b>.</li>
      </ul>
    ),
  },
];

export default function HelpPage() {
  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
      <SiteHeader />
      <article className="mt-4 rounded-2xl bg-white p-6 text-ink shadow-sm [&_li]:mt-1 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
        <h1 className="text-3xl font-bold">Troubleshooting &amp; help</h1>
        <div className="mt-4 divide-y divide-slate-200">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-3">
              <summary className="cursor-pointer list-none font-semibold marker:hidden">
                <span className="mr-2 inline-block transition group-open:rotate-90">›</span>
                {f.q}
              </summary>
              <div className="pl-5 text-slate-700">{f.a}</div>
            </details>
          ))}
        </div>
        <p className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm">
          Still stuck? Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-brand underline">
            {CONTACT_EMAIL}
          </a>{' '}
          with your browser, device and what you see.
        </p>
      </article>
      <SiteFooter />
    </main>
  );
}
