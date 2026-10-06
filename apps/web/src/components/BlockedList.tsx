'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BlockedUser } from '@rc/shared';
import { countryName, flagEmoji, GENDER_ICON, GENDER_LABEL } from '@/lib/format';
import { getSocket } from '@/lib/socket';

const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** People this browser blocked, with Unblock. `tone` matches a dark (call) or light (settings) background. */
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

  if (items === null) return <p className={`text-sm ${dark ? 'text-slate-400' : 'text-slate-500'}`}>Loading…</p>;
  if (items.length === 0) {
    return <p className={`text-sm ${dark ? 'text-slate-400' : 'text-slate-500'}`}>You haven&apos;t blocked anyone.</p>;
  }

  return (
    <div>
      {error && <p className="mb-2 text-sm text-red-500">{error}</p>}
      <ul className={`divide-y ${dark ? 'divide-white/10' : 'divide-slate-200'}`}>
        {items.map((b) => (
          <li key={b.id} className="flex items-center gap-3 py-2.5">
            <span className="text-xl" title={b.gender ? GENDER_LABEL[b.gender] : 'Unknown'} aria-hidden>
              {b.gender ? GENDER_ICON[b.gender] : '👤'}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-medium ${dark ? 'text-slate-100' : ''}`}>
                {b.gender ? GENDER_LABEL[b.gender] : 'Stranger'} · {b.country ? `${flagEmoji(b.country)} ${countryName(b.country)}` : '🌐 Location not shown'}
              </p>
              <p className={`text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>Blocked {fmtDate(b.createdAt)}</p>
            </div>
            <button
              onClick={() => unblock(b.id)}
              disabled={busy === b.id}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50 ${
                dark ? 'bg-white/10 text-sky-300 hover:bg-white/20' : 'bg-slate-100 text-brand hover:bg-slate-200'
              }`}
            >
              {busy === b.id ? 'Unblocking…' : 'Unblock'}
            </button>
          </li>
        ))}
      </ul>
      <p className={`mt-2 text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>Unblocked people can be matched with you again.</p>
    </div>
  );
}
