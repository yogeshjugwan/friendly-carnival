'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { DmThread } from '@rc/shared';
import { Avatar, Ticks, WA, WaThread, type WaContact } from '@/components/WaThread';
import { useAuth } from '@/lib/auth';
import { getSocket } from '@/lib/socket';

const when = (at: number) => {
  const d = new Date(at);
  if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/** WhatsApp-style inbox: conversations on the left, the open chat on the right (one at a time on phones). */
export default function MessagesPage() {
  const { user, loading } = useAuth();
  const [threads, setThreads] = useState<DmThread[] | null>(null);
  const [open, setOpen] = useState<WaContact | null>(null);
  const [tab, setTab] = useState<'chats' | 'requests'>('chats');

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
      <main className={`flex min-h-dvh flex-col items-center justify-center gap-3 ${WA.bg} p-6 text-center text-[#e9edef]`}>
        <p className="text-lg">Log in to see your messages.</p>
        <Link href="/login?next=/messages" className={`rounded-full ${WA.send} px-5 py-2 font-semibold text-white`}>
          Log in
        </Link>
      </main>
    );
  }

  const shown = (threads ?? []).filter((t) => (tab === 'requests' ? t.request : !t.request));
  const requests = (threads ?? []).filter((t) => t.request).length;

  return (
    <main className="flex h-dvh bg-[#111b21] text-[#e9edef]">
      <aside className={`flex min-h-0 w-full flex-col border-r border-[#222d34] md:w-[380px] ${open ? 'max-md:hidden' : ''}`}>
        <header className={`flex items-center gap-3 px-4 py-3 ${WA.bar}`}>
          <Link href="/" className="text-lg font-semibold">
            random<span className="text-[#00a884]">Call</span>
          </Link>
          <span className="mr-auto text-sm text-[#8696a0]">Messages</span>
          <Link href="/history" className="rounded-full px-3 py-1 text-sm text-[#8696a0] hover:bg-white/10" title="People you chatted with">
            🕘 History
          </Link>
        </header>
        <div className="flex gap-2 px-3 py-2">
          {(['chats', 'requests'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1 text-sm ${tab === t ? 'bg-[#0a332c] text-[#00a884]' : 'bg-[#202c33] text-[#8696a0]'}`}
            >
              {t === 'chats' ? 'Chats' : `Requests${requests ? ` (${requests})` : ''}`}
            </button>
          ))}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {threads === null && <li className="p-6 text-center text-sm text-[#8696a0]">Loading…</li>}
          {threads && shown.length === 0 && (
            <li className="p-6 text-center text-sm text-[#8696a0]">
              {tab === 'requests' ? 'No message requests.' : (
                <>
                  No chats yet. Message people from your{' '}
                  <Link href="/history" className="text-[#00a884]">
                    History
                  </Link>{' '}
                  or friends.
                </>
              )}
            </li>
          )}
          {shown.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => setOpen({ id: t.id, name: t.name, avatar: t.avatar, online: t.online })}
                className={`flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-[#202c33] ${open?.id === t.id ? 'bg-[#2a3942]' : ''}`}
              >
                <Avatar contact={t} size="h-12 w-12 text-3xl" />
                <span className="min-w-0 flex-1 border-b border-[#222d34] pb-3">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate font-medium">{t.name}</span>
                    {t.friend && <span className="text-xs text-pink-300">❤️</span>}
                    <span className={`ml-auto shrink-0 text-xs ${t.unread ? 'text-[#00a884]' : 'text-[#8696a0]'}`}>{when(t.lastAt)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className="truncate text-sm text-[#8696a0]">
                      {t.lastFromMe && <Ticks />}
                      {t.lastFromMe ? ' ' : ''}
                      {t.lastText}
                    </span>
                    {t.unread > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#00a884] px-1.5 text-[11px] font-bold text-[#111b21]">
                        {t.unread}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      {open ? (
        <WaThread
          key={open.id}
          contact={open}
          onBack={() => {
            setOpen(null);
            window.history.replaceState(null, '', '/messages');
            load();
          }}
          className="min-w-0 flex-1"
        />
      ) : (
        <div className={`hidden flex-1 flex-col items-center justify-center gap-2 ${WA.bg} text-center text-[#8696a0] md:flex`}>
          <p className="text-5xl">💬</p>
          <p className="text-lg text-[#e9edef]">randomCall Messages</p>
          <p className="text-sm">Pick a chat, or message someone from your History.</p>
        </div>
      )}
    </main>
  );
}
