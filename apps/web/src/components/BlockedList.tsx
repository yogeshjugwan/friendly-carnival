'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BlockedUser } from '@rc/shared';
import { countryName, flagEmoji, GENDER_ICON, GENDER_LABEL } from '@/lib/format';
import { getSocket } from '@/lib/socket';

const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** People this browser blocked, with Unblock. `tone="dark"` is the call screen's menu; the default suits a settings card. */
export function BlockedList({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const [items, setItems] = useState<BlockedUser[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dark = tone === 'dark';

  const load = useCallback(() => {
    const socket = getSocket();
    const t = window.setTimeout(() => setItems((cur) => cur ?? []), 8_000);
    socket.emit('blocks:list', (list) => {
      window.clearTimeout(t);
      setItems(list);
    });
  }, []);

  useEffect(load, [load]);

  const unblock = (id: string) => {
    setBusy(id);
    setError(null);
    getSocket()
      .timeout(8_000)
      .emit('blocks:remove', id, (err, ok) => {
        setBusy(null);
        if (err || !ok) return setError('Could not unblock. Please try again.');
        setItems((cur) => cur?.filter((b) => b.id !== id) ?? null);
      });
  };

  if (items === null) return <p className={`text-sm ${dark ? 'text-dim' : 'text-mute'}`}>Loading…</p>;
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 py-4 text-center">
        <span aria-hidden className="text-2xl">🛡️</span>
        <p className="m-0 text-sm font-semibold text-[#f4f5f7]">No one blocked</p>
        <p className={`m-0 text-[13px] ${dark ? 'text-dim' : 'text-mute'}`}>People you block during a chat show up here. You can unblock them any time.</p>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <p role="alert" className={`mb-2 text-sm ${dark ? 'text-red-500' : 'text-stop-text'}`}>
          {error}
        </p>
      )}
      <ul className={`divide-y ${dark ? 'divide-white/10' : 'divide-card-2'}`}>
        {items.map((b) => (
          <li key={b.id} className="flex items-center gap-3 py-2.5">
            <span className="text-xl" title={b.gender ? GENDER_LABEL[b.gender] : 'Unknown'} aria-hidden>
              {b.gender ? GENDER_ICON[b.gender] : '👤'}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-medium ${dark ? 'text-[#f4f5f7]' : 'text-[#f4f5f7]'}`}>
                {b.gender ? GENDER_LABEL[b.gender] : 'Stranger'} · {b.country ? `${flagEmoji(b.country)} ${countryName(b.country)}` : '🌐 Location not shown'}
              </p>
              <p className={`text-xs ${dark ? 'text-dim' : 'text-mute'}`}>Blocked {fmtDate(b.createdAt)}</p>
            </div>
            <button
              onClick={() => unblock(b.id)}
              disabled={busy === b.id}
              className={`text-sm font-semibold disabled:opacity-50 ${
                dark
                  ? 'rounded-full bg-white/10 px-3 py-1.5 text-lime hover:bg-white/20'
                  : 'h-11 flex-none rounded-xl border border-[#6b5d84] bg-transparent px-4 text-[#e6e8ec] hover:border-[#4a3f5c]'
              }`}
            >
              {busy === b.id ? 'Unblocking…' : 'Unblock'}
            </button>
          </li>
        ))}
      </ul>
      <p className={`mt-2 text-xs ${dark ? 'text-dim' : 'text-faint'}`}>Unblocked people can be matched with you again.</p>
    </div>
  );
}
