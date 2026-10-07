'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_FRIEND_NICKNAME, MAX_MESSAGE_LENGTH, type DirectMessage, type DmSendResult, type Friend } from '@rc/shared';
import { countryName, flagEmoji, GENDER_ICON, GENDER_LABEL } from '@/lib/format';
import type { RandomCall } from '@/lib/useRandomCall';
import { FAIL_TEXT, useSecondsLeft } from './OnlineUsers';
import { NotificationsToggle } from './Pwa';
import { getSocket } from '@/lib/socket';

const REFRESH_MS = 5_000;

const STATUS: Record<Friend['status'], { dot: string; label: string }> = {
  available: { dot: 'bg-emerald-400', label: 'Available' },
  'in-call': { dot: 'bg-amber-400', label: 'In a chat' },
  online: { dot: 'bg-sky-400', label: 'On randomCall' },
  offline: { dot: 'bg-slate-500', label: 'Offline' },
};

const time = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** A conversation with one friend; works whether or not they're online. */
function DmThread({ friend, onBack }: { friend: Friend; onBack: () => void }) {
  const [messages, setMessages] = useState<DirectMessage[] | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const socket = getSocket();
    socket.timeout(8_000).emit('dm:history', friend.id, (err, list) => setMessages(err || !list ? [] : list));
    const onNew = (dm: { friendId: string; message: DirectMessage }) => {
      if (dm.friendId !== friend.id) return;
      setMessages((m) => (m && !m.some((x) => x.id === dm.message.id) ? [...m, dm.message] : m));
      // Seen while open: mark it read.
      if (!dm.message.fromMe) socket.emit('dm:history', friend.id, () => undefined);
    };
    socket.on('dm:new', onNew);
    return () => void socket.off('dm:new', onNew);
  }, [friend.id]);

  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [messages]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setError(null);
    getSocket()
      .timeout(8_000)
      .emit('dm:send', friend.id, text, (err: Error | null, r: DmSendResult) => {
        if (err) return setError('Not sent — try again.');
        if (!r.ok) return setError(r.reason === 'not-friends' ? 'You are no longer friends.' : 'Not sent.');
        const sent = r.message;
        setMessages((m) => [...(m ?? []), sent]);
      });
    setDraft('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2">
        <button onClick={onBack} aria-label="Back to friends" className="rounded-full px-2 py-1 text-slate-300 hover:bg-white/10">
          ←
        </button>
        <span className="text-xl" aria-hidden>
          {friend.gender ? GENDER_ICON[friend.gender] : '🙂'}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{friend.nickname || describe(friend)}</p>
          <p className="text-xs text-slate-400">{STATUS[friend.status].label}</p>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-3">
        {messages === null && <p className="py-8 text-center text-sm text-slate-400">Loading…</p>}
        {messages?.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No messages yet. Say hi — they&apos;ll see it even if they&apos;re away.</p>}
        {messages?.map((m) => (
          <div key={m.id} className={`flex ${m.fromMe ? 'justify-end' : 'justify-start'}`}>
            <p className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm ${m.fromMe ? 'bg-brand text-white' : 'bg-white/10'}`}>
              {m.text}
              <span className="ml-2 align-bottom text-[10px] opacity-60">{time(m.at)}</span>
            </p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {error && <p className="mx-4 mb-1 text-xs text-amber-300">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex gap-2 border-t border-white/10 p-3"
      >
        <input
          value={draft}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message…"
          aria-label={`Message ${friend.nickname || 'your friend'}`}
          className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <button disabled={!draft.trim()} className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          Send
        </button>
      </form>
    </div>
  );
}

const describe = (f: Friend) =>
  `${f.gender ? GENDER_LABEL[f.gender] : 'Friend'} · ${f.country ? `${flagEmoji(f.country)} ${countryName(f.country)}` : '🌐'}`;

/** ❤️ Friends as a Meet-style side panel: status, Call, rename, remove. */
export function FriendsPanel({ call, onClose, className = '' }: { call: RandomCall; onClose: () => void; className?: string }) {
  const { listFriends, callFriend, cancelCall, removeFriend, renameFriend, outgoingCall } = call;
  const [friends, setFriends] = useState<Friend[] | null | 'guest'>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [thread, setThread] = useState<Friend | null>(null);
  const [draft, setDraft] = useState('');
  const left = useSecondsLeft(outgoingCall?.expiresAt ?? null);

  const refresh = useCallback(async () => {
    const list = await listFriends();
    setFriends(list === null ? 'guest' : list);
  }, [listFriends]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (call.status === 'connecting') onClose();
  }, [call.status, onClose]);

  const available = Array.isArray(friends) ? friends.filter((f) => f.status === 'available') : [];
  const others = Array.isArray(friends) ? friends.filter((f) => f.status !== 'available') : [];

  const row = (f: Friend) => {
    const calling = outgoingCall?.publicId === `friend:${f.id}`;
    return (
      <li key={f.id} className="rounded-xl bg-[#2a2b2e] px-3 py-2.5">
        <div className="flex items-center gap-3">
          <span className="relative text-2xl" aria-hidden>
            {f.gender ? GENDER_ICON[f.gender] : '🙂'}
            <span className={`absolute -bottom-0.5 -right-1 h-3 w-3 rounded-full border-2 border-[#2a2b2e] ${STATUS[f.status].dot}`} />
          </span>
          <div className="min-w-0 flex-1">
            {editing === f.id ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await renameFriend(f.id, draft);
                  setEditing(null);
                  void refresh();
                }}
                className="flex gap-1"
              >
                <input
                  autoFocus
                  value={draft}
                  maxLength={MAX_FRIEND_NICKNAME}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Nickname"
                  className="min-w-0 flex-1 rounded-md border border-slate-600 bg-transparent px-2 py-1 text-sm text-slate-100"
                />
                <button className="rounded-md bg-white/10 px-2 text-xs text-sky-300">Save</button>
              </form>
            ) : (
              <p className="truncate text-sm font-medium text-slate-100">{f.nickname || describe(f)}</p>
            )}
            <p className="truncate text-xs text-slate-400">
              {STATUS[f.status].label}
              {f.nickname ? ` · ${describe(f)}` : ''}
            </p>
          </div>
          {f.status === 'available' &&
            (calling ? (
              <button onClick={cancelCall} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-sky-300">
                Calling… {left}s
              </button>
            ) : (
              <button
                disabled={!!outgoingCall}
                onClick={async () => {
                  setError(null);
                  const r = await callFriend(f.id);
                  if (!r.ok) setError(FAIL_TEXT[r.reason]);
                }}
                className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                Call
              </button>
            ))}
        </div>
        <div className="mt-1.5 flex gap-3 pl-9 text-xs">
          <button onClick={() => setThread(f)} className="font-semibold text-sky-300 hover:text-sky-200">
            💬 Message
            {!!f.unread && <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] text-white">{f.unread}</span>}
          </button>
          <button
            onClick={() => {
              setEditing(editing === f.id ? null : f.id);
              setDraft(f.nickname ?? '');
            }}
            className="text-slate-400 hover:text-slate-200"
          >
            ✏️ Nickname
          </button>
          <button
            onClick={async () => {
              if (!window.confirm('Remove this friend? You will both lose each other from your lists.')) return;
              await removeFriend(f.id);
              void refresh();
            }}
            className="text-slate-400 hover:text-red-300"
          >
            Remove
          </button>
        </div>
      </li>
    );
  };

  return (
    <section className={`flex min-h-0 flex-col rounded-2xl bg-[#202124] text-slate-100 ${className}`} aria-labelledby="friends-title">
      <header className="flex items-center justify-between px-5 pb-2 pt-4">
        <div>
          <h2 id="friends-title" className="text-lg">
            ❤️ Friends
          </h2>
          {Array.isArray(friends) && (
            <p className="text-xs text-slate-400">
              {friends.length} friend{friends.length === 1 ? '' : 's'} · {available.length} available
            </p>
          )}
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-slate-300 hover:bg-white/10 hover:text-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </header>
      {error && <p className="mx-4 mb-1 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200">{error}</p>}
      {thread ? (
        <DmThread
          friend={(Array.isArray(friends) && friends.find((f) => f.id === thread.id)) || thread}
          onBack={() => {
            setThread(null);
            void refresh();
          }}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
          {friends === null && <p className="py-10 text-center text-sm text-slate-400">Loading…</p>}
          {friends === 'guest' && (
            <div className="py-10 text-center text-sm text-slate-300">
              <p>Log in to keep friends and call them again.</p>
              <Link href="/login?next=/" className="mt-3 inline-block rounded-full bg-brand px-4 py-2 font-semibold text-white">
                Log in
              </Link>
            </div>
          )}
          {Array.isArray(friends) && friends.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-400">No friends yet. In a chat, tap ❤️ Add friend — when you both tap it, you&apos;re friends.</p>
          )}
          {available.length > 0 && (
            <>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Available now</p>
              <ul className="space-y-2">{available.map(row)}</ul>
            </>
          )}
          {others.length > 0 && (
            <>
              <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">All friends</p>
              <ul className="space-y-2">{others.map(row)}</ul>
            </>
          )}
          {Array.isArray(friends) && friends.length > 0 && (
            <div className="mt-5">
              <NotificationsToggle compact />
            </div>
          )}
        </div>
      )}
      {!thread && <p className="px-5 py-3 text-center text-xs text-slate-500">Friends can call you while you&apos;re in the call screen. Emails are never shown.</p>}
    </section>
  );
}

const FRIEND_LABEL: Record<RandomCall['friendState'], string> = {
  none: '❤️ Add friend',
  requested: '❤️ Request sent',
  'they-requested': '❤️ Add back',
  friends: '❤️ Friends',
  'login-required': '❤️ Log in to add friends',
  'partner-guest': 'They need an account to be friends',
  full: 'Friends list is full',
};

/** ❤️ Add friend on the video (both people must tap it). */
export function FriendButton({ call }: { call: RandomCall }) {
  const st = call.friendState;
  if (st === 'login-required') {
    return (
      <Link href="/signup" className="rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-pink-200 hover:bg-black/80">
        {FRIEND_LABEL[st]}
      </Link>
    );
  }
  const active = st === 'friends' || st === 'requested';
  return (
    <button
      onClick={call.addFriend}
      disabled={st === 'friends' || st === 'requested' || st === 'partner-guest' || st === 'full'}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
        st === 'they-requested'
          ? 'animate-pulse bg-pink-500 text-white'
          : active
            ? 'bg-pink-500/90 text-white'
            : 'bg-black/60 text-pink-100 hover:bg-black/80 disabled:text-slate-300'
      }`}
    >
      {FRIEND_LABEL[st]}
    </button>
  );
}
