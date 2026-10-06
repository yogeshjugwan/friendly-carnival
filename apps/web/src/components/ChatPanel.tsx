'use client';

import { useEffect, useRef, useState } from 'react';
import { MAX_MESSAGE_LENGTH } from '@rc/shared';
import type { ChatLine } from '@/lib/useRandomCall';
import { languageName, translate, translationSupported, type Translation } from '@/lib/translate';
import { SendIcon } from './icons';

const EMOJIS = ['😀', '😂', '😊', '😍', '😎', '🤔', '😅', '😢', '😮', '👋', '👍', '🙏', '❤️', '🔥', '🎉', '🙌', '💯', '😉'];

interface Props {
  messages: ChatLine[];
  partnerTyping: boolean;
  /** Messages can only be sent while matched. */
  enabled: boolean;
  onSend: (text: string) => boolean;
  onTyping: () => void;
  className?: string;
  /** `card`: the white panel used for text chat. `meet`: the dark "In-call messages" panel. */
  variant?: 'card' | 'meet';
  /** Shows a close (✕) button in the meet header. */
  onClose?: () => void;
  /** Focus the message box when the panel opens. */
  autoFocus?: boolean;
  /** 🎲 Icebreaker button in the meet header. */
  onIcebreaker?: () => void;
  /** Plus members can turn on auto-translate; everyone can translate one message. */
  canAutoTranslate?: boolean;
}

/** A message from the stranger, with an on-device "Translate". */
function TheirMessage({ text, bubble, muted, auto }: { text: string; bubble: string; muted: string; auto: boolean }) {
  const [result, setResult] = useState<Translation | 'loading' | 'failed' | undefined>(undefined);
  const supported = translationSupported();
  const run = async () => {
    setResult('loading');
    setResult((await translate(text)) ?? 'failed');
  };
  useEffect(() => {
    if (auto && supported && result === undefined) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, supported]);
  const translated = result && typeof result === 'object' && 'text' in result ? result : null;
  return (
    <div className="flex max-w-[80%] flex-col items-start">
      <p className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm ${bubble}`}>
        <span className="sr-only">Stranger: </span>
        {translated ? translated.text : text}
      </p>
      {supported && (
        <button
          type="button"
          onClick={() => (translated ? setResult(undefined) : void run())}
          className={`ml-2 mt-0.5 text-[11px] hover:underline ${muted}`}
        >
          {result === 'loading'
            ? 'Translating…'
            : result === 'failed'
              ? "Can't translate this"
              : translated
                ? `Translated from ${languageName(translated.from)} · Show original`
                : result && 'same' in result
                  ? ''
                  : 'Translate'}
        </button>
      )}
    </div>
  );
}

export function ChatPanel({
  messages,
  partnerTyping,
  enabled,
  onSend,
  onTyping,
  className = '',
  variant = 'card',
  onClose,
  autoFocus,
  onIcebreaker,
  canAutoTranslate = false,
}: Props) {
  const [draft, setDraft] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const meet = variant === 'meet';
  // Auto-translate (Plus): remembered in this browser.
  const [auto, setAuto] = useState(false);
  const [autoHint, setAutoHint] = useState(false);
  useEffect(() => {
    try {
      setAuto(canAutoTranslate && window.localStorage.getItem('rc.autoTranslate') === '1');
    } catch {
      /* ignore */
    }
  }, [canAutoTranslate]);
  const toggleAuto = () => {
    if (!canAutoTranslate) return setAutoHint((h) => !h);
    const next = !auto;
    setAuto(next);
    try {
      window.localStorage.setItem('rc.autoTranslate', next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, partnerTyping]);

  useEffect(() => {
    if (autoFocus && enabled) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus, enabled]);

  const send = () => {
    if (onSend(draft)) {
      setDraft('');
      setShowEmoji(false);
    }
  };

  const t = meet
    ? {
        section: 'bg-[#202124] text-slate-100',
        system: 'text-slate-400',
        mine: 'bg-brand text-white',
        theirs: 'bg-[#3c4043] text-slate-100',
        footer: 'p-3',
        emojiBox: 'border-slate-700 bg-[#2a2b2e]',
        emojiBtn: 'hover:bg-white/10',
        input:
          'min-w-0 flex-1 rounded-full border border-slate-600 bg-transparent py-2.5 pl-4 pr-2 text-base text-slate-100 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none disabled:opacity-50',
        icon: 'text-slate-300 hover:bg-white/10',
      }
    : {
        section: 'bg-white text-ink',
        system: 'text-slate-500',
        mine: 'bg-brand text-white',
        theirs: 'bg-slate-100',
        footer: 'border-t border-slate-200 p-2',
        emojiBox: 'border-slate-200 bg-white',
        emojiBtn: 'hover:bg-slate-100',
        input: 'min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-base disabled:bg-slate-50',
        icon: 'hover:bg-slate-100',
      };

  return (
    <section className={`flex min-h-0 flex-col ${meet ? 'rounded-2xl' : 'rounded-xl'} ${t.section} ${className}`} aria-label="Text chat">
      {meet && (
        <>
          <header className="flex items-center justify-between px-5 pb-2 pt-4">
            <h2 className="mr-auto text-lg">In-call messages</h2>
            {translationSupported() && (
              <button
                onClick={toggleAuto}
                title={canAutoTranslate ? 'Auto-translate messages' : 'Auto-translate is a Plus feature'}
                aria-pressed={auto}
                className={`rounded-full px-2 py-1 text-xs font-medium ${auto ? 'bg-sky-200 text-slate-900' : 'text-slate-300 hover:bg-white/10'}`}
              >
                🌐 Auto{!canAutoTranslate && ' 👑'}
              </button>
            )}
            {onIcebreaker && (
              <button onClick={onIcebreaker} title="Icebreaker question" aria-label="Icebreaker question" className="rounded-full px-2 py-1 text-lg hover:bg-white/10">
                🎲
              </button>
            )}
            {onClose && (
              <button onClick={onClose} aria-label="Close chat" className="rounded-full p-2 text-slate-300 hover:bg-white/10 hover:text-white">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </header>
          {autoHint && (
            <p className="mx-4 mb-1 rounded-lg bg-amber-500/15 px-3 py-2 text-center text-xs text-amber-200">
              Auto-translate is a Plus feature. You can still tap Translate under any message.
            </p>
          )}
          <p className="mx-4 mb-1 rounded-lg bg-[#2a2b2e] px-3 py-2 text-center text-xs text-slate-400">
            💬 Messages are only between you and this stranger and are not saved when the chat ends.
          </p>
        </>
      )}
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
        {messages.map((m) =>
          m.from === 'system' ? (
            <p key={m.id} className={`text-center text-xs ${t.system}`}>
              {m.text}
            </p>
          ) : (
            <div key={m.id} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
              {m.from === 'me' ? (
                <p className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm ${t.mine}`}>
                  <span className="sr-only">You: </span>
                  {m.text}
                </p>
              ) : (
                <TheirMessage text={m.text} bubble={t.theirs} muted={t.system} auto={auto} />
              )}
            </div>
          ),
        )}
        {partnerTyping && <p className={`text-xs italic ${t.system}`}>Stranger is typing…</p>}
      </div>

      <div className={`relative ${t.footer}`}>
        {showEmoji && (
          <div className={`absolute bottom-full right-2 mb-2 grid grid-cols-6 gap-1 rounded-xl border p-2 shadow-lg ${t.emojiBox}`}>
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className={`rounded-md p-1 text-xl ${t.emojiBtn}`}
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
            placeholder={enabled ? (meet ? 'Send a message' : 'Type your message here…') : 'Waiting for a stranger…'}
            className={t.input}
            aria-label="Message"
          />
          <button
            type="button"
            onClick={() => setShowEmoji((s) => !s)}
            disabled={!enabled}
            className={`rounded-full px-2 py-2 text-xl disabled:opacity-40 ${t.icon}`}
            aria-label="Emoji"
            aria-expanded={showEmoji}
          >
            😊
          </button>
          {meet ? (
            <button
              type="submit"
              disabled={!enabled || !draft.trim()}
              aria-label="Send message"
              className="rounded-full p-2.5 text-sky-300 hover:bg-white/10 disabled:text-slate-500 disabled:hover:bg-transparent"
            >
              <SendIcon />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!enabled || !draft.trim()}
              className="rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-40"
            >
              Send
            </button>
          )}
        </form>
      </div>
    </section>
  );
}
