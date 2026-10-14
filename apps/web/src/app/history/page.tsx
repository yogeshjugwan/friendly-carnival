'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { DmThread, HistoryPerson, HistoryResult } from '@rc/shared';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { ThreadRow } from '@/components/WaThread';
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
const label = (p: HistoryPerson) => p.name || (p.hasAccount ? 'Stranger' : 'Guest');
const messageHref = (id: string, name: string) => `/messages?with=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`;

/** Filter pill; the ::before pads the hit area to 44px without growing the 36px pill. */
const tabCls = (on: boolean) =>
  `relative h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors before:absolute before:inset-x-0 before:-inset-y-1 ${
    on ? 'bg-[#F4F5F7] text-night' : 'bg-card-2 text-mute hover:text-[#F4F5F7]'
  }`;

function PersonAvatar({ p, size }: { p: HistoryPerson; size: string }) {
  return (
    <span className={`relative flex shrink-0 items-center justify-center rounded-full bg-card-2 ${size}`} aria-hidden>
      {p.avatar ?? (p.gender ? GENDER_ICON[p.gender] : '🙂')}
      {p.online && <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-card bg-lime" />}
    </span>
  );
}

/** A person's card: who they are, how often you met, and what you can do. */
function Profile({ p, onClose, onChanged }: { p: HistoryPerson; onClose: () => void; onChanged: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [following, setFollowing] = useState(p.following);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-t-[24px] border border-line bg-card p-6 pb-[max(24px,env(safe-area-inset-bottom))] text-center text-[#F4F5F7] shadow-2xl sm:rounded-[20px]"
        aria-label={`${label(p)}'s profile`}
      >
        <span className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-card-2 text-6xl">
          {p.avatar ?? (p.gender ? GENDER_ICON[p.gender] : '🙂')}
          {p.online && <span className="absolute bottom-1 right-1 h-5 w-5 rounded-full border-4 border-card bg-lime" title="Online now" />}
        </span>
        <h2 className="mt-3 font-display text-2xl font-bold">{label(p)}</h2>
        <p className="text-sm text-dim">
          {p.country ? `${flagEmoji(p.country)} ${countryName(p.country)}` : 'Location hidden'}
          {p.online && <span className="text-lime"> · Online now</span>}
          {p.friend && ' · Friend'}
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-card-2 p-3">
            <dt className="text-xs text-dim">Chats together</dt>
            <dd className="font-display text-xl font-bold">{p.count}</dd>
          </div>
          <div className="rounded-xl bg-card-2 p-3">
            <dt className="text-xs text-dim">Last chat</dt>
            <dd className="mt-1 font-semibold capitalize">
              {p.lastMode} · {ago(p.lastAt)}
            </dd>
          </div>
        </dl>
        {p.hasAccount ? (
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => router.push(messageHref(p.id, label(p)))}
              className="h-11 rounded-xl bg-lime font-semibold text-night transition-colors hover:bg-lime-hover"
            >
              Message
            </button>
            <button
              type="button"
              disabled={busy}
              aria-pressed={following}
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
              className={`h-11 rounded-xl font-semibold transition-colors disabled:opacity-50 ${
                following ? 'bg-card-2 text-mute hover:text-[#F4F5F7]' : 'bg-gold text-night hover:brightness-110'
              }`}
            >
              {following ? '✓ Following' : 'Follow'}
            </button>
          </div>
        ) : (
          <p className="mt-5 rounded-xl bg-card-2 p-3 text-sm text-mute">They were chatting as a guest, so you can&apos;t follow or message them.</p>
        )}
        {following && <p className="mt-2 text-xs text-dim">You&apos;ll get a notification when they come online.</p>}
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(`Remove ${label(p)} from your history?`)) return;
              getSocket()
                .timeout(8_000)
                .emit('history:remove', p.id, () => {
                  onChanged();
                  onClose();
                });
            }}
            className="-ml-2 h-11 rounded-lg px-2 text-[#FF6B6B] hover:underline"
          >
            Remove from history
          </button>
          <button type="button" onClick={onClose} className="-mr-2 h-11 rounded-lg px-3 font-semibold text-mute hover:text-[#F4F5F7]">
            Close
          </button>
        </div>
      </section>
    </div>
  );
}

/** The Messages card beside the history on desktop: a compact inbox linking into /messages. */
function InboxCard() {
  const [threads, setThreads] = useState<DmThread[] | null>(null);
  const [tab, setTab] = useState<'chats' | 'requests'>('chats');

  useEffect(() => {
    const socket = getSocket();
    const load = () => socket.timeout(8_000).emit('dm:threads', (err, list) => setThreads(err || !list ? [] : list));
    load();
    socket.on('dm:new', load);
    socket.on('dm:read', load);
    const t = window.setInterval(load, 30_000);
    return () => {
      socket.off('dm:new', load);
      socket.off('dm:read', load);
      window.clearInterval(t);
    };
  }, []);

  const shown = (threads ?? []).filter((t) => (tab === 'requests' ? t.request : !t.request));
  const requests = (threads ?? []).filter((t) => t.request).length;

  return (
    <section className="flex max-h-[calc(100dvh-140px)] min-h-[420px] flex-col overflow-hidden rounded-[20px] border border-line bg-card" aria-labelledby="inbox-title">
      <div className="flex items-center justify-between gap-3 border-b border-divider p-[18px]">
        <h2 id="inbox-title" className="font-display text-lg font-bold">
          <Link href="/messages" className="hover:text-lime">
            Messages
          </Link>
        </h2>
        <div className="flex gap-1.5" role="group" aria-label="Show">
          {(['chats', 'requests'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t} className={tabCls(tab === t)}>
              {t === 'chats' ? 'Chats' : `Requests${requests ? ` (${requests})` : ''}`}
            </button>
          ))}
        </div>
      </div>
      {threads === null ? (
        <p className="flex flex-1 items-center justify-center p-6 text-sm text-dim">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <span className="mb-1 grid h-14 w-14 place-items-center rounded-2xl bg-card-2 text-lime">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden>
              <path d="M21 12a8 8 0 01-12 7l-5 1 1-4a8 8 0 1116-4z" />
            </svg>
          </span>
          <p className="font-semibold">{tab === 'requests' ? 'No message requests' : 'No chats yet'}</p>
          <p className="max-w-[260px] text-[13px] text-dim">
            {tab === 'requests' ? 'When someone new writes to you, it shows up here.' : 'Open someone from your history to message them here.'}
          </p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-divider overflow-y-auto">
          {shown.map((t) => (
            <li key={t.id}>
              <ThreadRow t={t} href={messageHref(t.id, t.name)} />
            </li>
          ))}
        </ul>
      )}
    </section>
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
  const stats = [
    ['chats', data?.total],
    ['this week', data?.recent],
    ['people', data?.people.length],
  ] as const;
  const closeProfile = useCallback(() => setOpen(null), []);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-[1200px] flex-col gap-5 px-4 py-6 sm:px-6">
      <SiteHeader />

      {loading ? null : !user ? (
        <>
          <h1 className="mt-1 font-display text-[26px] font-bold leading-tight sm:text-[40px]">History</h1>
          <p className="rounded-[18px] border border-line bg-card p-5 text-center text-mute sm:rounded-[20px]">
            <Link href="/login?next=/history" className="font-semibold text-lime underline-offset-2 hover:underline">
              Log in
            </Link>{' '}
            to keep a history of the people you chat with — and follow or message them later.
          </p>
        </>
      ) : (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex min-w-0 flex-col gap-3.5 sm:gap-[18px]">
            <div className="mt-1 flex items-center justify-between gap-3 sm:items-end">
              <h1 className="font-display text-[26px] font-bold leading-tight sm:text-[40px]">History</h1>
              {/* Desktop: totals beside the title. */}
              <dl className="flex gap-6 text-[13px] text-dim max-sm:hidden">
                {stats.map(([k, v]) => (
                  <div key={k} className="flex flex-row-reverse items-baseline gap-1.5">
                    <dt>{k}</dt>
                    <dd className="font-display text-[22px] font-bold text-[#F4F5F7]">{v ?? '—'}</dd>
                  </div>
                ))}
              </dl>
              <Link href="/messages" className={`${tabCls(false)} flex items-center lg:hidden max-sm:ml-auto`}>
                Messages
              </Link>
            </div>

            {/* Phone: totals as three tiles. */}
            <dl className="grid grid-cols-3 gap-2 sm:hidden">
              {stats.map(([k, v]) => (
                <div key={k} className="flex flex-col-reverse rounded-[18px] border border-line bg-card p-3 text-center">
                  <dt className="text-[11px] text-dim">{k}</dt>
                  <dd className="font-display text-[22px] font-bold">{v ?? '—'}</dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-wrap gap-1.5 sm:gap-2" role="group" aria-label="Filter">
              {(['all', 'online', 'following'] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} className={tabCls(filter === f)}>
                  {f === 'all' ? (
                    'Recent'
                  ) : f === 'online' ? (
                    <>
                      Online<span className="max-sm:hidden"> now</span>
                    </>
                  ) : (
                    'Following'
                  )}
                </button>
              ))}
            </div>

            <ul className="divide-y divide-divider overflow-hidden rounded-[18px] border border-line bg-card sm:rounded-[20px]">
              {data === null && <li className="p-6 text-center text-sm text-dim">Loading…</li>}
              {data && people.length === 0 && (
                <li className="p-8 text-center text-sm text-dim">
                  {filter === 'all' ? 'No chats yet — people you meet will show up here.' : 'Nobody here yet.'}
                </li>
              )}
              {people.map((p) => (
                <li key={p.id} className="flex items-center gap-2 pr-3.5 sm:pr-[18px]">
                  <button
                    type="button"
                    onClick={() => setOpen(p)}
                    className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3.5 text-left transition-colors hover:bg-card-2/60 sm:gap-3.5 sm:py-3.5 sm:pl-[18px]"
                    aria-haspopup="dialog"
                  >
                    <PersonAvatar p={p} size="h-10 w-10 text-2xl sm:h-11 sm:w-11" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-semibold">
                        <span className="truncate">{label(p)}</span>
                        {p.friend && (
                          <span className="text-xs text-lime" title="Friend">
                            ♥
                          </span>
                        )}
                        {p.following && (
                          <span className="text-xs text-gold" title="Following">
                            ★
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-dim sm:text-[13px]">
                        {p.country ? `${countryName(p.country)} · ` : ''}
                        {p.lastMode} · {ago(p.lastAt)}
                        {p.count > 1 && <span title="Chats together"> · ×{p.count}</span>}
                      </span>
                    </span>
                  </button>
                  {p.hasAccount ? (
                    <Link href={messageHref(p.id, label(p))} className={`${tabCls(false)} flex items-center`} aria-label={`Message ${label(p)}`}>
                      Message
                    </Link>
                  ) : (
                    <span className="flex h-9 shrink-0 items-center rounded-full bg-card-2 px-3.5 text-[13px] font-medium text-mute opacity-50" title="Guests can't be messaged">
                      Guest
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-center text-[11px] text-faint sm:text-left sm:text-xs">
              Only you see your history. Guests can&apos;t be followed or messaged.
            </p>
          </div>

          <div className="max-lg:hidden lg:sticky lg:top-6 lg:self-start">
            <InboxCard />
          </div>
        </div>
      )}
      {open && <Profile p={open} onClose={closeProfile} onChanged={load} />}
      <SiteFooter />
    </main>
  );
}
