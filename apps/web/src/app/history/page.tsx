'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { HistoryPerson, HistoryResult } from '@rc/shared';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { useAuth } from '@/lib/auth';
import { countryName, flagEmoji, GENDER_ICON } from '@/lib/format';
import { getSocket } from '@/lib/socket';

const ago = (at: number) => {
  const s = Math.max(1, Math.round((Date.now() - at) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} d ago` : new Date(at).toLocaleDateString();
};
const MODE = { video: '📹', voice: '🎙️', text: '💬' } as const;
const label = (p: HistoryPerson) => p.name || (p.hasAccount ? 'Stranger' : 'Guest');

/** A person's card: who they are, how often you met, and what you can do. */
function Profile({ p, onClose, onChanged }: { p: HistoryPerson; onClose: () => void; onChanged: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [following, setFollowing] = useState(p.following);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <section
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-t-3xl bg-white p-6 text-center text-ink shadow-2xl sm:rounded-3xl"
        aria-label={`${label(p)}'s profile`}
      >
        <span className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-slate-100 text-6xl">
          {p.avatar ?? (p.gender ? GENDER_ICON[p.gender] : '🙂')}
          {p.online && <span className="absolute bottom-1 right-1 h-5 w-5 rounded-full border-4 border-white bg-emerald-500" title="Online now" />}
        </span>
        <h2 className="mt-3 text-2xl font-bold">{label(p)}</h2>
        <p className="text-slate-500">
          {p.country ? `${flagEmoji(p.country)} ${countryName(p.country)}` : '🌐 Location hidden'}
          {p.friend && ' · ❤️ Friend'}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-slate-100 p-2">
            <dt className="text-xs text-slate-500">Chats together</dt>
            <dd className="text-xl font-bold">{p.count}</dd>
          </div>
          <div className="rounded-xl bg-slate-100 p-2">
            <dt className="text-xs text-slate-500">Last chat</dt>
            <dd className="font-semibold">
              {MODE[p.lastMode]} {ago(p.lastAt)}
            </dd>
          </div>
        </dl>
        {p.hasAccount ? (
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              onClick={() => router.push(`/messages?with=${encodeURIComponent(p.id)}&name=${encodeURIComponent(label(p))}`)}
              className="rounded-xl bg-[#00a884] py-2.5 font-semibold text-white"
            >
              💬 Message
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                getSocket()
                  .timeout(8_000)
                  .emit('follow:set', p.id, !following, (err, ok) => {
                    setBusy(false);
                    if (!err && ok) {
                      setFollowing(!following);
                      onChanged();
                    }
                  });
              }}
              className={`rounded-xl py-2.5 font-semibold disabled:opacity-50 ${following ? 'bg-slate-200 text-slate-700' : 'bg-amber-400 text-black'}`}
            >
              {following ? '✓ Following' : '⭐ Follow'}
            </button>
          </div>
        ) : (
          <p className="mt-5 rounded-xl bg-slate-100 p-3 text-sm text-slate-600">They were chatting as a guest, so you can&apos;t follow or message them.</p>
        )}
        {following && <p className="mt-2 text-xs text-slate-500">You&apos;ll get a notification when they come online.</p>}
        <div className="mt-4 flex justify-between text-sm">
          <button
            onClick={() => {
              if (!window.confirm(`Remove ${label(p)} from your history?`)) return;
              getSocket()
                .timeout(8_000)
                .emit('history:remove', p.id, () => {
                  onChanged();
                  onClose();
                });
            }}
            className="text-red-600 hover:underline"
          >
            🗑 Remove from history
          </button>
          <button onClick={onClose} className="font-semibold text-slate-600">
            Close
          </button>
        </div>
      </section>
    </div>
  );
}

export default function HistoryPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<HistoryResult | null>(null);
  const [filter, setFilter] = useState<'all' | 'following' | 'online'>('all');
  const [open, setOpen] = useState<HistoryPerson | null>(null);

  const load = useCallback(() => {
    getSocket()
      .timeout(8_000)
      .emit('history:list', (err, r) => setData(err || !r ? { people: [], total: 0, recent: 0 } : r));
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
    const t = window.setInterval(load, 30_000);
    return () => window.clearInterval(t);
  }, [user, load]);

  const people = (data?.people ?? []).filter((p) => (filter === 'following' ? p.following : filter === 'online' ? p.online : true));

  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
      <SiteHeader />
      <section className="mt-2 flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-3xl font-bold">🕘 History</h1>
        <Link href="/messages" className="rounded-full bg-[#00a884] px-4 py-2 text-sm font-semibold text-white">
          💬 Messages
        </Link>
      </section>

      {loading ? null : !user ? (
        <p className="rounded-xl bg-white/5 p-4 text-center text-slate-300">
          <Link href="/login?next=/history" className="font-semibold text-sky-300 underline">
            Log in
          </Link>{' '}
          to keep a history of the people you chat with — and follow or message them later.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-3 text-center">
            {[
              ['Total chats', data?.total],
              ['Last 7 days', data?.recent],
              ['People', data?.people.length],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-2xl bg-white p-3 text-ink">
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="text-2xl font-bold">{v ?? '—'}</dd>
              </div>
            ))}
          </dl>

          <div className="flex gap-2 text-sm">
            {(['all', 'online', 'following'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 ${filter === f ? 'bg-white text-ink' : 'bg-white/10 text-slate-200'}`}
              >
                {f === 'all' ? 'Recent' : f === 'online' ? '🟢 Online now' : '⭐ Following'}
              </button>
            ))}
          </div>

          <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl bg-white/5">
            {data === null && <li className="p-6 text-center text-slate-400">Loading…</li>}
            {data && people.length === 0 && (
              <li className="p-6 text-center text-slate-400">
                {filter === 'all' ? 'No chats yet — people you meet will show up here.' : 'Nobody here yet.'}
              </li>
            )}
            {people.map((p) => (
              <li key={p.id}>
                <button onClick={() => setOpen(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5">
                  <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-3xl">
                    {p.avatar ?? (p.gender ? GENDER_ICON[p.gender] : '🙂')}
                    {p.online && <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-ink bg-emerald-500" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-medium">
                      <span className="truncate">{label(p)}</span>
                      {p.friend && <span title="Friend">❤️</span>}
                      {p.following && <span title="Following">⭐</span>}
                    </span>
                    <span className="block truncate text-sm text-slate-400">
                      {p.country ? `${flagEmoji(p.country)} ${countryName(p.country)} · ` : ''}
                      {MODE[p.lastMode]} {ago(p.lastAt)}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs text-slate-300" title="Chats together">
                    ×{p.count}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-center text-xs text-slate-500">Only you can see your history. Guests you met can&apos;t be followed or messaged.</p>
        </>
      )}
      {open && <Profile p={open} onClose={() => setOpen(null)} onChanged={load} />}
      <SiteFooter />
    </main>
  );
}
