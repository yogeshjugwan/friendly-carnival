'use client';

import Link from 'next/link';
import { CoinChip } from './Coins';
import { useAuth } from '@/lib/auth';

export function Brand() {
  return (
    <Link href="/" className="text-2xl font-semibold tracking-tight">
      random<span className="text-brand">Call</span>
    </Link>
  );
}

/** Top bar for the landing, account and legal pages. */
export function SiteHeader({ online }: { online?: number | null }) {
  const { user, loading } = useAuth();
  return (
    <header className="flex flex-wrap items-center gap-3">
      <span className="mr-auto">
        <Brand />
      </span>
      {/* The online count is a Plus perk. */}
      {online !== undefined && !!user?.plus.active && (
        <span className="flex items-center gap-2 text-sm text-slate-300">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          {online === null ? 'Connecting…' : `${online.toLocaleString()} online`}
        </span>
      )}
      {!loading &&
        (user ? (
          <>
            {user.plus.active ? (
              <Link href="/plus" className="rounded-full bg-amber-400/15 px-2.5 py-0.5 text-sm font-semibold text-amber-300" title="Your Plus membership">
                👑 Plus member
              </Link>
            ) : (
              <Link href="/plus" className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600">
                👑 Upgrade
              </Link>
            )}
            <CoinChip className="!py-1.5" />
            <Link href="/settings" className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-medium hover:bg-slate-600">
              {user.email.split('@')[0]} · Settings
            </Link>
          </>
        ) : (
          <>
            <span className="rounded-full border border-slate-600 px-2.5 py-0.5 text-xs text-slate-300" title="You are chatting as a guest">
              👤 Guest
            </span>
            <Link href="/plus" className="text-sm font-semibold text-amber-300 hover:text-amber-200">
              👑 Get Plus
            </Link>
            <Link href="/settings" className="text-sm text-slate-300 hover:text-white">
              Settings
            </Link>
            <Link href="/login" className="text-sm font-medium text-slate-200 hover:text-white">
              Log in
            </Link>
            <Link href="/signup" className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold hover:bg-brand-dark">
              Sign up
            </Link>
          </>
        ))}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-800 py-5 text-sm text-slate-400">
      <span>© {new Date().getFullYear()} randomCall</span>
      <Link href="/guidelines" className="hover:text-white">
        Community Guidelines
      </Link>
      <Link href="/terms" className="hover:text-white">
        Terms of Use
      </Link>
      <Link href="/privacy" className="hover:text-white">
        Privacy Policy
      </Link>
      <Link href="/help" className="hover:text-white">
        Help
      </Link>
    </footer>
  );
}

/** Centered card used by the login, signup and password pages. */
export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-full max-w-5xl flex-col px-4 py-6 sm:px-6">
      <SiteHeader />
      <section className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-ink shadow-xl">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {children}
        </div>
      </section>
    </main>
  );
}
