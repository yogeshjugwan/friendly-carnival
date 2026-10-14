'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { HistoryPerson, HistoryResult } from '@rc/shared';
import { AppShell } from '@/components/AppShell';
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

/** Filter pill (40px desktop, 38px phone; the ::before pads the hit area to 44px). */
const tabCls = (on: boolean) =>
  `relative h-[38px] shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition-colors before:absolute before:inset-x-0 before:-inset-y-1 lg:h-10 lg:px-4 lg:text-sm ${
    on ? 'bg-[#F4F5F7] text-night' : 'border border-line-2 bg-transparent text-mute hover:text-[#F4F5F7]'
  }`;

const HUES = ['#8A5FC2', '#3FA08A', '#E08A4F', '#5878D8', '#D06483'];
const hue = (id: string) => HUES[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % HUES.length];

function PersonAvatar({ p }: { p: HistoryPerson }) {
  return (
    <span
      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl"
      style={{ background: `linear-gradient(165deg, ${hue(p.id)}, #211A2B)` }}
      aria-hidden
    >
      {p.avatar ?? (p.gender ? GENDER_ICON[p.gender] : '')}
      {p.online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-night bg-lime lg:border-card" />}
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(11,8,17,.72)] lg:items-center sm:p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-t-[24px] border border-divider bg-card p-6 pb-[max(24px,env(safe-area-inset-bottom))] text-center text-[#F4F5F7] shadow-2xl lg:rounded-[22px]"
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
              className="h-[50px] rounded-[14px] bg-lime font-display font-bold text-night transition-colors hover:bg-lime-hover"
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
              className={`h-[50px] rounded-[14px] border-[1.5px] font-semibold transition-colors disabled:opacity-50 ${
                following ? 'border-[#4a3f5c] text-mute hover:text-[#F4F5F7]' : 'border-[#4a3f5c] text-[#e6e8ec] hover:border-lime'
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
            className="-ml-2 h-11 rounded-lg px-2 text-stop-text hover:underline"
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

  const plus = !!user?.plus.active;
  const people = (data?.people ?? []).filter((p) => (filter === 'following' ? p.following : filter === 'online' ? p.online : true));
  const closeProfile = useCallback(() => setOpen(null), []);
  const follow = (p: HistoryPerson) =>
    getSocket()
      .timeout(8_000)
      .emit('follow:set', p.id, true, (err, ok) => {
        if (!err && ok) load();
      });

  return (
    <AppShell
      title={
        <span className="flex flex-col">
          History
          {user && (
            <span className="mt-1 font-sans text-[13px] font-normal text-mute lg:text-sm">
              {data?.recent ?? '—'} chats this week<span className="max-lg:hidden"> · {data?.people.length ?? '—'} people</span> ·{' '}
              <span className="lg:hidden">only you see this</span>
              <span className="max-lg:hidden">only you can see this</span>
            </span>
          )}
        </span>
      }
    >
      {loading ? null : !user ? (
        <p className="m-0 rounded-[18px] border border-line bg-card p-5 text-center text-mute lg:rounded-[20px]">
          <Link href="/login?next=/history" className="font-semibold text-lime underline-offset-2 hover:underline">
            Log in
          </Link>{' '}
          to keep a history of the people you chat with — and follow or message them later.
        </p>
      ) : (
        <div className="-mt-2 flex min-w-0 flex-col gap-3 lg:-mt-0.5 lg:gap-[18px]">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter">
            {(['all', 'online', 'following'] as const).map((f) =>
              f === 'online' && !plus ? (
                <Link key={f} href="/plus" className={`${tabCls(false)} flex items-center`}>
                  Online<span className="max-lg:hidden"> now</span> · Plus
                </Link>
              ) : (
                <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} className={tabCls(filter === f)}>
                  {f === 'all' ? (
                    'All'
                  ) : f === 'online' ? (
                    <>
                      Online<span className="max-lg:hidden"> now</span>
                    </>
                  ) : (
                    'Following'
                  )}
                </button>
              ),
            )}
          </div>

          <ul className="m-0 flex list-none flex-col gap-0.5 p-0 lg:gap-0 lg:overflow-hidden lg:rounded-[20px] lg:border lg:border-line lg:bg-card">
            {data === null && <li className="p-6 text-center text-sm text-dim">Loading…</li>}
            {data && people.length === 0 && (
              <li className="p-8 text-center text-sm text-dim">
                {filter === 'all' ? 'No chats yet — people you meet will show up here.' : 'Nobody here yet.'}
              </li>
            )}
            {people.map((p) => {
              const canMessage = p.following || p.friend;
              return (
                <li key={p.id} className="flex items-center gap-3 border-b border-[#1a1422] px-1 lg:gap-3.5 lg:border-card-2 lg:px-[18px] lg:last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setOpen(p)}
                    className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left lg:gap-3.5 lg:py-3.5"
                    aria-haspopup="dialog"
                  >
                    <PersonAvatar p={p} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                        <span className="truncate">{label(p)}</span>
                        {p.friend && (
                          <span className="text-xs text-lime" title="Friend">
                            ♥
                          </span>
                        )}
                      </span>
                      <span className="truncate text-xs text-mute lg:text-[13px]">
                        {p.country ? `${countryName(p.country)} · ` : ''}
                        {p.lastMode} · {ago(p.lastAt)}
                        {p.count > 1 && <span title="Chats together"> · ×{p.count}</span>}
                      </span>
                    </span>
                  </button>
                  {!p.hasAccount ? (
                    <span className="flex h-10 shrink-0 items-center rounded-xl border border-divider px-3.5 text-[13px] font-semibold text-[#8a8f99] lg:px-4 lg:text-sm" title="Guests can't be messaged">
                      Guest
                    </span>
                  ) : canMessage ? (
                    <Link
                      href={messageHref(p.id, label(p))}
                      className="flex h-11 shrink-0 items-center rounded-xl bg-lime px-3.5 text-[13px] font-semibold text-night lg:h-10 lg:px-4 lg:text-sm"
                      aria-label={`Message ${label(p)}`}
                    >
                      Message
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => follow(p)}
                      className="flex h-11 shrink-0 items-center rounded-xl border border-line-2 px-3.5 text-[13px] font-semibold text-[#e6e8ec] hover:border-lime lg:h-10 lg:px-4 lg:text-sm"
                      aria-label={`Follow ${label(p)}`}
                    >
                      Follow
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {open && <Profile p={open} onClose={closeProfile} onChanged={load} />}
    </AppShell>
  );
}
