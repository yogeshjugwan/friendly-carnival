'use client';

import { useEffect, useRef, useState } from 'react';
import { MAX_MESSAGE_LENGTH } from '@rc/shared';
import type { ChatLine } from '@/lib/useRandomCall';

const EMOJIS = ['😀', '😂', '😊', '😍', '😎', '🤔', '😅', '😢', '😮', '👋', '👍', '🙏', '❤️', '🔥', '🎉', '🙌', '💯', '😉'];

interface Props {
  messages: ChatLine[];
  partnerTyping: boolean;
  /** Messages can only be sent while matched. */
  enabled: boolean;
  onSend: (text: string) => boolean;
  onTyping: () => void;
  className?: string;
}

export function ChatPanel({ messages, partnerTyping, enabled, onSend, onTyping, className = '' }: Props) {
  const [draft, setDraft] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, partnerTyping]);

  const send = () => {
    if (onSend(draft)) {
      setDraft('');
      setShowEmoji(false);
    }
  };

  return (
    <section className={`flex min-h-0 flex-col rounded-xl bg-white text-ink ${className}`} aria-label="Text chat">
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
        {messages.map((m) =>
          m.from === 'system' ? (
            <p key={m.id} className="text-center text-xs text-slate-500">
              {m.text}
            </p>
          ) : (
            <div key={m.id} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
              <p
                className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm ${
                  m.from === 'me' ? 'bg-brand text-white' : 'bg-slate-100'
                }`}
              >
                <span className="sr-only">{m.from === 'me' ? 'You: ' : 'Stranger: '}</span>
                {m.text}
              </p>
            </div>
          ),
        )}
        {partnerTyping && <p className="text-xs italic text-slate-400">Stranger is typing…</p>}
      </div>

      <div className="relative border-t border-slate-200 p-2">
        {showEmoji && (
          <div className="absolute bottom-full right-2 mb-2 grid grid-cols-6 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className="rounded-md p-1 text-xl hover:bg-slate-100"
                onClick={() => {
                  setDraft((d) => (d + e).slice(0, MAX_MESSAGE_LENGTH));
                  inputRef.current?.focus();
                }}
                aria-label={`Insert ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            ref={inputRef}
            value={draft}
            maxLength={MAX_MESSAGE_LENGTH}
            disabled={!enabled}
            onChange={(e) => {
              setDraft(e.target.value);
              onTyping();
            }}
            placeholder={enabled ? 'Type your message here…' : 'Waiting for a stranger…'}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-base disabled:bg-slate-50"
            aria-label="Message"
          />
          <button
            type="button"
            onClick={() => setShowEmoji((s) => !s)}
            disabled={!enabled}
            className="rounded-lg px-2 py-2 text-xl hover:bg-slate-100 disabled:opacity-40"
            aria-label="Emoji"
            aria-expanded={showEmoji}
          >
            😊
          </button>
          <button
            type="submit"
            disabled={!enabled || !draft.trim()}
            className="rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    </section>
  );
}
