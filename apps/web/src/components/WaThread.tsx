'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { DM_REQUEST_LIMIT, MAX_MESSAGE_LENGTH, type ChatMode, type DirectMessage, type DmSendResult, type DmThread } from '@rc/shared';
import { getSocket } from '@/lib/socket';

/** Thread colours (the night / lime look). Kept under the old name for existing imports. */
export const WA = {
  bg: 'bg-night',
  bar: 'bg-card',
  mine: 'bg-lime text-night',
  theirs: 'bg-card-2',
  input: 'bg-card',
  send: 'bg-lime text-night',
  muted: 'text-dim',
} as const;

export interface WaContact {
  id: string;
  name: string;
  avatar: string | null;
  online?: boolean;
  /** When / how you last met on a call, if known: shown at the top of the thread. */
  met?: { at: number; mode: ChatMode };
}

const time = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const dayLabel = (at: number) => {
  const d = new Date(at);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};

/** Inbox time: "14:05" today, "Yesterday", else "3 Oct". */
export const threadTime = (at: number) => {
  const d = new Date(at);
  if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/** ✓ sent · ✓✓ read. `onLime` for ticks inside your own (lime) bubble. */
export function Ticks({ read, onLime = false }: { read?: boolean; onLime?: boolean }) {
  const colour = onLime ? (read ? 'text-night' : 'text-night/50') : read ? 'text-lime' : 'text-dim';
  return (
    <span className={`ml-1 text-[11px] ${colour}`} aria-label={read ? 'Read' : 'Sent'}>
      {read ? '✓✓' : '✓'}
    </span>
  );
}

export function Avatar({
  contact,
  size = 'h-10 w-10 text-2xl',
  rounded = 'rounded-full',
}: {
  contact: Pick<WaContact, 'avatar' | 'online'>;
  size?: string;
  rounded?: string;
}) {
  return (
    <span className={`relative flex shrink-0 items-center justify-center bg-card-2 ${rounded} ${size}`} aria-hidden>
      {contact.avatar ?? '🙂'}
      {contact.online && <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-card bg-lime" />}
    </span>
  );
}

/** One conversation in an inbox list: a link (`href`) or a button (`onClick`). */
export function ThreadRow({ t, href, onClick, active = false }: { t: DmThread; href?: string; onClick?: () => void; active?: boolean }) {
  const body = (
    <>
      <Avatar contact={t} size="h-11 w-11 text-2xl" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate font-semibold">{t.name}</span>
          {t.friend && (
            <span className="text-xs text-lime" title="Friend">
              ♥
            </span>
          )}
          <span className={`ml-auto shrink-0 text-xs ${t.unread ? 'font-semibold text-lime' : 'text-dim'}`}>{threadTime(t.lastAt)}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className={`truncate text-[13px] ${t.unread ? 'text-mute' : 'text-dim'}`}>
            {t.lastFromMe && <Ticks />}
            {t.lastFromMe ? ' ' : ''}
            {t.lastText}
          </span>
          {t.unread > 0 && (
            <span
              className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-lime px-1.5 text-[11px] font-bold text-night"
              aria-label={`${t.unread} unread`}
            >
              {t.unread}
            </span>
          )}
        </span>
      </span>
    </>
  );
  const cls = `flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-card-2 sm:px-[18px] ${active ? 'bg-card-2' : ''}`;
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls} aria-current={active || undefined}>
      {body}
    </button>
  );
}

/** A conversation with someone (friend, someone you met, or a message request). `onCall` shows the video-call button. */
export function WaThread({
  contact,
  onBack,
  onCall,
  className = '',
}: {
  contact: WaContact;
  onBack?: () => void;
  onCall?: () => void;
  className?: string;
}) {
  const [messages, setMessages] = useState<DirectMessage[] | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const socket = getSocket();
    const load = () => socket.timeout(8_000).emit('dm:history', contact.id, (err, list) => setMessages(err || !list ? [] : list));
    load();
    const onNew = (dm: { friendId: string; message: DirectMessage }) => {
      if (dm.friendId !== contact.id) return;
      setMessages((m) => (m && !m.some((x) => x.id === dm.message.id) ? [...m, dm.message] : m));
      // Seen while open: marks it read for them.
      if (!dm.message.fromMe) socket.emit('dm:history', contact.id, () => undefined);
    };
    const onRead = (id: string) => id === contact.id && load();
    socket.on('dm:new', onNew);
    socket.on('dm:read', onRead);
    return () => {
      socket.off('dm:new', onNew);
      socket.off('dm:read', onRead);
    };
  }, [contact.id]);

  useEffect(() => {
    void endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setError(null);
    getSocket()
      .timeout(8_000)
      .emit('dm:send', contact.id, text, (err: Error | null, r: DmSendResult) => {
        if (err) return setError('Not sent — check your connection.');
        if (!r.ok) {
          return setError(
            r.reason === 'wait-reply'
              ? `They haven't replied yet — you can send ${DM_REQUEST_LIMIT} messages until they do.`
              : r.reason === 'not-friends'
                ? "You can't message this person."
                : 'Not sent.',
          );
        }
        const sent = r.message;
        setMessages((m) => [...(m ?? []), sent]);
        setDraft('');
      });
  };

  const theyWrote = messages?.some((m) => !m.fromMe);
  const iWrote = messages?.some((m) => m.fromMe);
  const iconBtn = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors';

  return (
    <section className={`flex min-h-0 flex-col bg-night text-[#F4F5F7] ${className}`} aria-label={`Chat with ${contact.name}`}>
      <header className="flex items-center gap-2.5 border-b border-divider px-4 py-3">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Back" className={`${iconBtn} bg-card-2 text-[#E6E8EC] hover:bg-line`}>
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
        )}
        <Avatar contact={{ avatar: contact.avatar }} rounded="rounded-[12px]" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{contact.name}</p>
          <p className={`text-xs ${contact.online ? 'text-lime' : 'text-dim'}`}>{contact.online ? 'Online' : 'Offline'}</p>
        </div>
        {onCall && (
          <button type="button" onClick={onCall} aria-label={`Video call ${contact.name}`} className={`${iconBtn} bg-lime text-night hover:bg-lime-hover`}>
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="2" y="6" width="14" height="12" rx="2" />
              <path d="M16 10l6-3v10l-6-3" />
            </svg>
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
        {/* Pushes a short conversation to the bottom, next to the input. */}
        <div className="flex-1" />
        <p className="mx-auto mb-3 max-w-sm rounded-xl border border-gold/20 bg-gold-bg px-3 py-2 text-center text-[11px] leading-snug text-gold">
          Messages stay on randomCall. Never share passwords, money or private photos.
        </p>
        {contact.met && (
          <p className="mb-2 text-center text-[11px] text-faint">
            You met on a {contact.met.mode} chat · {dayLabel(contact.met.at)}
          </p>
        )}
        {messages === null && <p className="py-8 text-center text-sm text-dim">Loading…</p>}
        {messages?.length === 0 && <p className="py-8 text-center text-sm text-dim">Say hi 👋 — they&apos;ll see it even if they&apos;re away.</p>}
        {messages?.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString();
          const grouped = prev && prev.fromMe === m.fromMe && !newDay;
          return (
            <div key={m.id} className="flex flex-col">
              {newDay && <p className="mb-1 mt-3 text-center text-[11px] text-faint">{dayLabel(m.at)}</p>}
              <p
                className={`max-w-[75%] whitespace-pre-wrap break-words px-3.5 py-2.5 text-[14px] leading-snug ${grouped ? 'mt-1' : 'mt-2'} ${
                  m.fromMe ? 'self-end rounded-[18px_18px_4px_18px] bg-lime text-night' : 'self-start rounded-[18px_18px_18px_4px] bg-card-2'
                }`}
              >
                {m.text}
                <span className={`float-right ml-2 mt-1.5 translate-y-0.5 text-[10.5px] ${m.fromMe ? 'text-night/60' : 'text-dim'}`}>
                  {time(m.at)}
                  {m.fromMe && <Ticks read={m.read} onLime />}
                </span>
              </p>
            </div>
          );
        })}
        {theyWrote && !iWrote && (
          <p className="mx-auto mt-4 rounded-full bg-card-2 px-3 py-1.5 text-center text-xs text-mute">
            This is a message request. Reply to chat, or just ignore it.
          </p>
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <p className="border-t border-divider bg-gold-bg px-4 py-2 text-xs text-gold" role="alert">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-center gap-2 border-t border-divider px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3"
      >
        <input
          value={draft}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message…"
          aria-label={`Message ${contact.name}`}
          className="h-11 min-w-0 flex-1 rounded-full border border-line-2 bg-card px-4 text-[14px] text-[#F4F5F7] placeholder:text-faint focus:border-lime/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Send"
          className={`${iconBtn} bg-lime text-night hover:bg-lime-hover disabled:opacity-40 disabled:hover:bg-lime`}
        >
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden>
            <path d="M4 12l16-8-6 16-2-7z" />
          </svg>
        </button>
      </form>
    </section>
  );
}
