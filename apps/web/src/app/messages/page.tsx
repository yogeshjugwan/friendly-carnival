'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { DmThread } from '@rc/shared';
import { AppShell, PeopleNav, ShellActions } from '@/components/AppShell';
import { ThreadRow, WaThread, type WaContact } from '@/components/WaThread';
import { useAuth } from '@/lib/auth';
import { getSocket } from '@/lib/socket';

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
    if (known)
      setOpen({
        id,
        name: known.name,
        avatar: known.avatar,
        online: known.online,
      });
    else if (threads) setOpen({ id, name: name || 'New chat', avatar: null });
  }, [threads, open]);

  if (!loading && !user) {
    return (
      <AppShell title={<><span className="lg:hidden">People</span><span className="max-lg:hidden">Messages</span></>}>
        <PeopleNav className="-mt-2" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
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
        </div>
      </AppShell>
    );
  }

  const shown = (threads ?? []).filter((t) => (tab === 'requests' ? t.request : !t.request));
  const requests = (threads ?? []).filter((t) => t.request).length;

  return (
    <AppShell
      title={
        <>
          <span className="lg:hidden">People</span>
          <span className="sr-only">Messages</span>
        </>
      }
      actions={
        <div className="lg:hidden">
          <ShellActions />
        </div>
      }
    >
      {/* Desktop: conversations beside the open chat. Phones: the list; an open chat covers the screen (no tab bar). */}
      <div className="flex min-h-0 flex-1 lg:-mx-10 lg:-mb-8 lg:-mt-11 lg:h-dvh lg:flex-none">
        <section aria-label="Conversations" className="flex min-h-0 w-full flex-col gap-3.5 lg:w-[340px] lg:shrink-0 lg:border-r lg:border-[#1a1422] lg:px-4 lg:py-6">
          <h2 aria-hidden className="mx-2 font-display text-[26px] font-bold max-lg:hidden">
            Messages
          </h2>
          <PeopleNav className="-mt-2" />
          <div role="tablist" aria-label="Messages" className="grid grid-cols-2 gap-1 rounded-xl border border-divider bg-card p-1">
            {(['chats', 'requests'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`h-11 rounded-[9px] text-sm font-semibold ${
                  tab === t ? 'bg-pick text-[#F4F5F7] shadow-[inset_0_0_0_1.5px_#FF6FAE]' : 'text-mute hover:text-[#F4F5F7]'
                }`}
              >
                {t === 'chats' ? 'Chats' : `Requests · ${requests}`}
              </button>
            ))}
          </div>
          <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {threads === null && <li className="p-6 text-center text-sm text-dim">Loading…</li>}
            {threads && shown.length === 0 && (
              <li className="px-6 py-10 text-center text-sm text-dim">
                {tab === 'requests' ? (
                  'No new requests'
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
                <ThreadRow
                  t={t}
                  active={open?.id === t.id}
                  onClick={() =>
                    setOpen({
                      id: t.id,
                      name: t.name,
                      avatar: t.avatar,
                      online: t.online,
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </section>
        {open ? (
          <WaThread
            key={open.id}
            contact={{ ...open, met: met[open.id] }}
            onBack={() => {
              setOpen(null);
              window.history.replaceState(null, '', '/messages');
              load();
            }}
            backClassName="lg:hidden"
            onRemoved={() => {
              setOpen(null);
              window.history.replaceState(null, '', '/messages');
              load();
            }}
            className="min-w-0 flex-1 max-lg:fixed max-lg:inset-0 max-lg:z-40"
          />
        ) : (
          <div className="hidden flex-1 flex-col items-center justify-center gap-2 p-6 text-center lg:flex">
            <span className="mb-1 grid h-14 w-14 place-items-center rounded-2xl bg-card-2 text-lime">
              <ChatIcon />
            </span>
            <p className="font-semibold">Pick a chat</p>
            <p className="max-w-[260px] text-[13px] text-dim">Open a conversation, or message someone from your History.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ChatIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden>
      <path d="M21 12a8 8 0 01-12 7l-5 1 1-4a8 8 0 1116-4z" />
    </svg>
  );
}
