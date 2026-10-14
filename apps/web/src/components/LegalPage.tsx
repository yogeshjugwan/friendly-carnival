import { SiteFooter, SiteHeader } from './SiteHeader';

export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'support@example.com';
export const UPDATED = '1 October 2026';

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
      <SiteHeader />
      <article className="mt-4 rounded-2xl bg-card p-6 text-[#f4f5f7] shadow-sm [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-sm text-dim">Last updated {UPDATED}</p>
        <p className="rounded-lg bg-gold-bg px-3 py-2 text-sm text-gold">
          Template: have this reviewed by a lawyer for your country before a public launch.
        </p>
        {children}
      </article>
      <SiteFooter />
    </main>
  );
}
