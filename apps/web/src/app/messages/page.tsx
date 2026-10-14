'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { DmThread } from '@rc/shared';
import { Brand } from '@/components/SiteHeader';
import { ThreadRow, WaThread, type WaContact } from '@/components/WaThread';
import { useAuth } from '@/lib/auth';
import { getSocket } from '@/lib/socket';

/** Filter pill; the ::before pads the hit area to 44px without growing the 36px pill. */
const tabCls = (on: boolean) =>
  `relative h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors before:absolute before:inset-x-0 before:-inset-y-1 ${
    on ? 'bg-[#F4F5F7] text-night' : 'bg-card-2 text-mute hover:text-[#F4F5F7]'
  }`;

/** Inbox: conversations on the left, the open chat on the right (one at a time on phones). */
export default function MessagesPage() {
  const { user, loading } = useAuth();
  const [threads, setThreads] = useState<DmThread[] | null>(null);
  const [open, setOpen] = useState<WaContact | null>(null);
  const [tab, setTab] = useState<'chats' | 'requests'>('chats');
  // When you last met each person on a call (for the "You met on…" line in the thread).
  const [met, setMet] = useState<Record<string, NonNullable<WaContact['met']>>>({});

  const load = useCallback(() => {
    getSocket()
      .timeout(8_000)
      .emit('dm:threads', (err, list) => setThreads(err || !list ? [] : list));
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
    const socket = getSocket();
    socket.on('dm:new', load);
    socket.on('dm:read', load);
    const t = window.setInterval(load, 20_000);
    return () => {
      socket.off('dm:new', load);
      socket.off('dm:read', load);
      window.clearInterval(t);
    };
  }, [user, load]);

  useEffect(() => {
    if (!user) return;
    getSocket()
      .timeout(8_000)
      .emit('history:list', (err, r) => {
        if (err || !r) return;
        setMet(Object.fromEntries(r.people.map((p) => [p.id, { at: p.lastAt, mode: p.lastMode }])));
      });
  }, [user]);

  // Keep the open chat's name / online dot in step with the list.
  useEffect(() => {
    const t = open && threads?.find((x) => x.id === open.id);
    if (t && (t.online !== open.online || t.name !== open.name || t.avatar !== open.avatar)) {
      setOpen({ id: t.id, name: t.name, avatar: t.avatar, online: t.online });
    }
  }, [threads, open]);

  // /messages?with=<id> (from History, a notification or Friends) opens that chat.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('with');
    if (!id || open) return;
    const known = threads?.find((t) => t.id === id);
    const name = new URLSearchParams(window.location.search).get('name');
    if (known) setOpen({ id, name: known.name, avatar: known.avatar, online: known.online });
    else if (threads) setOpen({ id, name: name || 'New chat', avatar: null });
  }, [threads, open]);

  if (!loading && !user) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-night p-6 text-center text-[#F4F5F7]">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-card-2 text-lime">
          <ChatIcon />
        </span>
        <p className="text-lg">Log in to see your messages.</p>
        <Link
          href="/login?next=/messages"
          className="flex h-11 items-center rounded-full bg-lime px-6 font-semibold text-night transition-colors hover:bg-lime-hover"
        >
          Log in
        </Link>
      </main>
    );
  }

  const shown = (threads ?? []).filter((t) => (tab === 'requests' ? t.request : !t.request));
  const requests = (threads ?? []).filter((t) => t.request).length;

  return (
    <main className="flex h-dvh flex-col bg-night text-[#F4F5F7]">
      <header className={`border-b border-line ${open ? 'max-md:hidden' : ''}`}>
        <div className="mx-auto flex max-w-[1200px] items-center gap-3 px-4 py-3 sm:px-6">
          <Brand wordmark />
          <div className="flex-1" />
          <Link
            href="/history"
            className="flex h-11 items-center rounded-xl border border-line bg-card px-3.5 text-[13px] font-medium text-[#C9CDD4] transition-colors hover:text-[#F4F5F7]"
            title="People you chatted with"
          >
            History
          </Link>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[1200px] flex-1 md:p-6">
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden md:rounded-[20px] md:border md:border-line">
          <aside className={`flex min-h-0 w-full flex-col md:w-[380px] md:shrink-0 md:border-r md:border-divider md:bg-card ${open ? 'max-md:hidden' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-5 md:border-b md:border-divider md:p-[18px]">
              <h1 className="font-display text-[26px] font-bold md:text-lg">Messages</h1>
              <div className="flex gap-1.5" role="group" aria-label="Show">
                {(['chats', 'requests'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t} className={tabCls(tab === t)}>
                    {t === 'chats' ? 'Chats' : `Requests${requests ? ` (${requests})` : ''}`}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto max-md:px-4 max-md:pb-4">
              <ul className="divide-y divide-divider overflow-hidden max-md:rounded-[18px] max-md:border max-md:border-line max-md:bg-card">
                {threads === null && <li className="p-6 text-center text-sm text-dim">Loading…</li>}
                {threads && shown.length === 0 && (
                  <li className="px-6 py-10 text-center text-sm text-dim">
                    {tab === 'requests' ? (
                      'No message requests.'
                    ) : (
                      <>
                        <span className="mb-1 block font-semibold text-[#F4F5F7]">No chats yet</span>
                        Message people from your{' '}
                        <Link href="/history" className="font-medium text-lime underline-offset-2 hover:underline">
                          History
                        </Link>{' '}
                        or friends.
                      </>
                    )}
                  </li>
                )}
                {shown.map((t) => (
                  <li key={t.id}>
                    <ThreadRow t={t} active={open?.id === t.id} onClick={() => setOpen({ id: t.id, name: t.name, avatar: t.avatar, online: t.online })} />
                  </li>
                ))}
              </ul>
            </div>
          </aside>
          {open ? (
            <WaThread
              key={open.id}
              contact={{ ...open, met: met[open.id] }}
              onBack={() => {
                setOpen(null);
                window.history.replaceState(null, '', '/messages');
                load();
              }}
              className="min-w-0 flex-1"
            />
          ) : (
            <div className="hidden flex-1 flex-col items-center justify-center gap-2 p-6 text-center md:flex">
              <span className="mb-1 grid h-14 w-14 place-items-center rounded-2xl bg-card-2 text-lime">
                <ChatIcon />
              </span>
              <p className="font-semibold">Pick a chat</p>
              <p className="max-w-[260px] text-[13px] text-dim">Open a conversation, or message someone from your History.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function ChatIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden>
      <path d="M21 12a8 8 0 01-12 7l-5 1 1-4a8 8 0 1116-4z" />
    </svg>
  );
}
