'use client';

import { useEffect, useRef, useState } from 'react';
import { DM_REQUEST_LIMIT, MAX_MESSAGE_LENGTH, type DirectMessage, type DmSendResult } from '@rc/shared';
import { getSocket } from '@/lib/socket';

/** WhatsApp-like colours (dark theme). */
export const WA = {
  bg: 'bg-[#0b141a]',
  bar: 'bg-[#202c33]',
  mine: 'bg-[#005c4b]',
  theirs: 'bg-[#202c33]',
  input: 'bg-[#2a3942]',
  send: 'bg-[#00a884]',
  muted: 'text-[#8696a0]',
} as const;

export interface WaContact {
  id: string;
  name: string;
  avatar: string | null;
  online?: boolean;
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

/** ✓ sent · ✓✓ read (blue). */
export function Ticks({ read }: { read?: boolean }) {
  return (
    <span className={`ml-1 text-[11px] ${read ? 'text-[#53bdeb]' : WA.muted}`} aria-label={read ? 'Read' : 'Sent'}>
      {read ? '✓✓' : '✓'}
    </span>
  );
}

export function Avatar({ contact, size = 'h-10 w-10 text-2xl' }: { contact: Pick<WaContact, 'avatar' | 'online'>; size?: string }) {
  return (
    <span className={`relative flex shrink-0 items-center justify-center rounded-full bg-[#374248] ${size}`} aria-hidden>
      {contact.avatar ?? '🙂'}
      {contact.online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#111b21] bg-[#25d366]" />}
    </span>
  );
}

/** A WhatsApp-style conversation with someone (friend, someone you met, or a message request). */
export function WaThread({ contact, onBack, className = '' }: { contact: WaContact; onBack?: () => void; className?: string }) {
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

  return (
    <section className={`flex min-h-0 flex-col ${WA.bg} text-[#e9edef] ${className}`} aria-label={`Chat with ${contact.name}`}>
      <header className={`flex items-center gap-3 px-3 py-2 ${WA.bar}`}>
        {onBack && (
          <button onClick={onBack} aria-label="Back" className="rounded-full px-2 py-1 text-xl hover:bg-white/10">
            ←
          </button>
        )}
        <Avatar contact={contact} />
        <div className="min-w-0">
          <p className="truncate font-medium">{contact.name}</p>
          <p className={`text-xs ${contact.online ? 'text-[#25d366]' : WA.muted}`}>{contact.online ? 'online' : 'offline'}</p>
        </div>
      </header>

      <div
        className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3 sm:px-[6%]"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
      >
        <p className="mx-auto mb-2 max-w-sm rounded-lg bg-[#182229] px-3 py-1.5 text-center text-[11px] text-[#ffd279]">
          🔒 Messages stay on randomCall. Never share passwords, money or private photos.
        </p>
        {messages === null && <p className={`py-8 text-center text-sm ${WA.muted}`}>Loading…</p>}
        {messages?.length === 0 && <p className={`py-8 text-center text-sm ${WA.muted}`}>Say hi 👋 — they&apos;ll see it even if they&apos;re away.</p>}
        {messages?.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString();
          const grouped = prev && prev.fromMe === m.fromMe && !newDay;
          return (
            <div key={m.id}>
              {newDay && (
                <p className="my-2 text-center">
                  <span className={`rounded-lg ${WA.bar} px-3 py-1 text-[11px] ${WA.muted}`}>{dayLabel(m.at)}</span>
                </p>
              )}
              <div className={`flex ${m.fromMe ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-0.5' : 'mt-2'}`}>
                <p
                  className={`relative max-w-[80%] whitespace-pre-wrap break-words rounded-lg px-2.5 pb-1.5 pt-1.5 text-[14.5px] shadow ${
                    m.fromMe ? `${WA.mine} ${grouped ? '' : 'rounded-tr-none'}` : `${WA.theirs} ${grouped ? '' : 'rounded-tl-none'}`
                  }`}
                >
                  {m.text}
                  <span className={`float-right ml-2 mt-1.5 translate-y-0.5 text-[11px] ${WA.muted}`}>
                    {time(m.at)}
                    {m.fromMe && <Ticks read={m.read} />}
                  </span>
                </p>
              </div>
            </div>
          );
        })}
        {theyWrote && !iWrote && (
          <p className={`mt-3 text-center text-xs ${WA.muted}`}>This is a message request. Reply to chat, or just ignore it.</p>
        )}
        <div ref={endRef} />
      </div>

      {error && <p className="bg-[#111b21] px-4 py-1.5 text-xs text-[#ffd279]">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className={`flex items-center gap-2 px-2 py-2 ${WA.bar}`}
      >
        <input
          value={draft}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message"
          aria-label={`Message ${contact.name}`}
          className={`min-w-0 flex-1 rounded-lg ${WA.input} px-4 py-2.5 text-[15px] text-[#e9edef] placeholder:text-[#8696a0] focus:outline-none`}
        />
        <button
          disabled={!draft.trim()}
          aria-label="Send"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${WA.send} text-white transition disabled:opacity-40`}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
            <path d="M2 21 23 12 2 3v7l15 2-15 2z" />
          </svg>
        </button>
      </form>
    </section>
  );
}
