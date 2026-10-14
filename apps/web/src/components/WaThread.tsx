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

const TINTS = ['#8A5FC2', '#3FA08A', '#E08A4F', '#5878D8', '#D06483'];
/** A stable colour per person for the avatar gradient. */
export const tint = (id = '') => TINTS[[...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0) % TINTS.length];

export function Avatar({
  contact,
  size = 'h-10 w-10 text-2xl',
  rounded = 'rounded-full',
  ring = 'border-card',
}: {
  contact: Pick<WaContact, 'avatar' | 'online'> & { id?: string };
  size?: string;
  rounded?: string;
  /** Border colour of the online dot (match the surface behind the avatar). */
  ring?: string;
}) {
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center ${rounded} ${size}`}
      style={{ background: `linear-gradient(165deg, ${tint(contact.id)}, #211A2B)` }}
      aria-hidden
    >
      {contact.avatar}
      {contact.online && <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 bg-lime ${ring}`} />}
    </span>
  );
}

/** One conversation in an inbox list: a link (`href`) or a button (`onClick`). */
export function ThreadRow({ t, href, onClick, active = false }: { t: DmThread; href?: string; onClick?: () => void; active?: boolean }) {
  const body = (
    <>
      <Avatar contact={t} size="h-11 w-11 text-2xl" ring={active ? 'border-card-2' : 'border-night'} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <strong className="truncate text-[15px] font-semibold">{t.name}</strong>
          {t.friend && (
            <span className="text-xs text-lime" title="Friend">
              ♥
            </span>
          )}
        </span>
        <span className={`truncate text-[13px] ${t.unread ? 'text-[#F4F5F7]' : 'text-mute'}`}>
          {t.lastFromMe && <Ticks />}
          {t.lastFromMe ? ' ' : ''}
          {t.lastText}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className={`text-xs ${t.unread ? 'font-semibold text-lime' : 'text-[#8A8F99]'}`}>{threadTime(t.lastAt)}</span>
        {t.unread > 0 && (
          <span
            className="flex h-5 min-w-5 items-center justify-center rounded-full bg-lime px-1.5 text-[11px] font-bold text-night"
            aria-label={`${t.unread} unread`}
          >
            {t.unread}
          </span>
        )}
      </span>
    </>
  );
  const cls = `flex min-h-16 w-full items-center gap-3 rounded-[14px] px-2.5 py-2 text-left text-[#F4F5F7] transition-colors ${
    active ? 'bg-card-2' : 'hover:bg-card'
  }`;
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
  backClassName = '',
}: {
  contact: WaContact;
  onBack?: () => void;
  onCall?: () => void;
  className?: string;
  /** Extra classes for the back button (e.g. hide it where the list is beside the thread). */
  backClassName?: string;
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
  const icon = (d: React.ReactNode) => (
    <svg viewBox="0 0 24 24" className="h-5 w-5 @2xl:h-[18px] @2xl:w-[18px]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d}
    </svg>
  );

  // `@container`: the wide layout (Video call label, Send text button) follows the thread's own width,
  // so the narrow call side panel keeps the phone look.
  return (
    <section className={`@container flex min-h-0 flex-col bg-night text-[#F4F5F7] ${className}`} aria-label={`Chat with ${contact.name}`}>
      <div className="flex h-[72px] shrink-0 items-center gap-2.5 border-b border-[#1a1422] px-3 @2xl:h-[76px] @2xl:gap-3 @2xl:px-6">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Back" className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#F4F5F7] hover:bg-card-2 ${backClassName}`}>
            {icon(<path d="M15 6l-6 6 6 6" />)}
          </button>
        )}
        <Avatar contact={{ id: contact.id, avatar: contact.avatar }} size="h-10 w-10 text-xl @2xl:h-11 @2xl:w-11 @2xl:text-2xl" />
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-[15px] font-semibold @2xl:text-base">{contact.name}</strong>
          <p className={`mt-px text-xs @2xl:mt-0.5 @2xl:text-[13px] ${contact.online ? 'text-lime' : 'text-[#8A8F99]'}`}>{contact.online ? 'Online' : 'Offline'}</p>
        </div>
        {onCall && (
          <button
            type="button"
            onClick={onCall}
            aria-label={`Video call ${contact.name}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-lime text-sm font-semibold text-night hover:bg-lime-hover @2xl:w-auto @2xl:px-4"
          >
            {icon(
              <>
                <rect x="2" y="6" width="14" height="12" rx="2" />
                <path d="M16 10l6-3v10l-6-3" />
              </>,
            )}
            <span className="hidden @2xl:inline">Video call</span>
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 @2xl:p-6">
        {/* Pushes a short conversation to the bottom, next to the input. */}
        <div className="flex-1" />
        {contact.met && (
          <p className="mb-2 self-center text-center text-xs text-[#8A8F99]">
            You met on a {contact.met.mode} chat · {dayLabel(contact.met.at)}
          </p>
        )}
        <p className="mb-2 self-center text-center text-[11px] text-faint">Never share passwords, money or private photos.</p>
        {messages === null && <p className="py-8 text-center text-sm text-dim">Loading…</p>}
        {messages?.length === 0 && <p className="py-8 text-center text-sm text-dim">Say hi 👋 — they&apos;ll see it even if they&apos;re away.</p>}
        {messages?.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString();
          return (
            <div key={m.id} className="flex flex-col">
              {newDay && <p className="mb-1 mt-3 text-center text-[11px] text-[#8A8F99]">{dayLabel(m.at)}</p>}
              <p
                className={`mt-2 max-w-[75%] whitespace-pre-wrap break-words px-3.5 py-2.5 text-[15px] leading-snug @2xl:mt-2.5 @2xl:max-w-[60%] ${
                  m.fromMe ? 'self-end rounded-[16px_16px_4px_16px] bg-lime text-night' : 'self-start rounded-[16px_16px_16px_4px] bg-card-2'
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
        <p className="border-t border-[#1a1422] bg-gold-bg px-4 py-2 text-xs text-gold" role="alert">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex gap-2 border-t border-[#1a1422] px-3 pb-[max(24px,env(safe-area-inset-bottom))] pt-2.5 @2xl:border-t-0 @2xl:px-6 @2xl:pt-4"
      >
        <label className="flex min-w-0 flex-1">
          <span className="sr-only">Message {contact.name}</span>
          <input
            value={draft}
            maxLength={MAX_MESSAGE_LENGTH}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message…"
            className="h-12 min-w-0 flex-1 rounded-3xl border border-line-2 bg-card px-4 text-[15px] text-[#F4F5F7] placeholder:text-faint focus:border-lime/60 focus:outline-none @2xl:h-[52px] @2xl:rounded-[14px]"
          />
        </label>
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Send"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-lime font-display text-[15px] font-bold text-night hover:bg-lime-hover disabled:opacity-40 disabled:hover:bg-lime @2xl:h-[52px] @2xl:w-auto @2xl:rounded-[14px] @2xl:px-[22px]"
        >
          <span className="@2xl:hidden">{icon(<path d="M5 12h14M13 6l6 6-6 6" />)}</span>
          <span className="hidden @2xl:inline">Send</span>
        </button>
      </form>
    </section>
  );
}
