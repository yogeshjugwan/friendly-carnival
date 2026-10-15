'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ActiveUser, CallRequestResult } from '@rc/shared';
import { countryName, flagEmoji, GENDER_ICON, GENDER_LABEL } from '@/lib/format';
import type { RandomCall } from '@/lib/useRandomCall';
import { VerifiedBadge } from './VerifiedBadge';
import { useFocusTrap } from '@/lib/useFocusTrap';

const REFRESH_MS = 5_000;

export const FAIL_TEXT: Record<Extract<CallRequestResult, { ok: false }>['reason'], string> = {
  'plus-required': 'Calling people directly is a Plus feature.',
  gone: 'They just left.',
  busy: 'They are busy right now.',
  unavailable: 'They are not available.',
  pending: 'Wait for your current call request first.',
  mode: 'They are in a different chat mode.',
  offline: 'They are not in the call screen right now.',
  'login-required': 'Log in to call friends.',
  cooldown: 'They said no recently — try again in a few minutes.',
};

export const useSecondsLeft = (until: number | null) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [until]);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
};

/** Plus: live list of people searching or chatting, with "Call" for those waiting. */
/** Plus "Online now" as a Meet-style side panel (same place as In-call messages). */
export function OnlineUsersPanel({ call, onClose, className = '' }: { call: RandomCall; onClose: () => void; className?: string }) {
  const [users, setUsers] = useState<ActiveUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { listUsers, callUser, cancelCall, outgoingCall, mode } = call;
  const left = useSecondsLeft(outgoingCall?.expiresAt ?? null);

  const refresh = useCallback(async () => {
    const list = await listUsers();
    if (list === null) setError('The Online list is a Plus feature.');
    setUsers(list ?? []);
  }, [listUsers]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(t);
  }, [refresh]);

  // A call that connected closes the list.
  useEffect(() => {
    if (call.status === 'connecting') onClose();
  }, [call.status, onClose]);

  const waiting = users?.filter((u) => u.state === 'waiting') ?? [];
  const busy = users?.filter((u) => u.state === 'in-call') ?? [];

  const row = (u: ActiveUser) => {
    const calling = outgoingCall?.publicId === u.publicId;
    const sameMode = u.mode === mode;
    return (
      <li key={u.publicId} className="flex items-center gap-3 rounded-xl bg-[#2a2b2e] px-3 py-2.5">
        <span className="text-2xl" title={GENDER_LABEL[u.gender]} aria-label={GENDER_LABEL[u.gender]}>
          {u.avatar ?? GENDER_ICON[u.gender]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-[#f4f5f7]">
            {u.name && <span className="max-w-[7rem] truncate font-semibold">{u.name}</span>}
            <span>{u.locationHidden ? '📍' : flagEmoji(u.country)}</span>
            <span className="truncate">{u.locationHidden ? 'Location hidden' : countryName(u.country)}</span>
            {u.verified && <VerifiedBadge />}
            {u.plus && <span title="Plus member">👑</span>}
            {u.mode === 'text' && <span className="rounded bg-white/10 px-1.5 text-[10px] font-semibold uppercase text-mute">text</span>}
            {u.mode === 'voice' && <span className="rounded bg-white/10 px-1.5 text-[10px] font-semibold uppercase text-mute">voice</span>}
          </p>
          {u.bio && <p className="truncate text-xs italic text-mute">“{u.bio}”</p>}
          {u.interests.length > 0 && <p className="truncate text-xs text-dim">likes {u.interests.join(', ')}</p>}
        </div>
        {u.state === 'in-call' ? (
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-mute">In a chat</span>
        ) : calling ? (
          <button onClick={cancelCall} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-lime">
            Calling… {left}s · Cancel
          </button>
        ) : (
          <button
            disabled={!sameMode || !!outgoingCall}
            title={sameMode ? 'Ask to chat' : 'They are in a different chat mode'}
            onClick={async () => {
              setError(null);
              const r = await callUser(u.publicId);
              if (!r.ok) {
                setError(FAIL_TEXT[r.reason]);
                void refresh();
              }
            }}
            className="rounded-full bg-lime px-4 py-1.5 text-sm font-semibold text-night disabled:opacity-40"
          >
            Call
          </button>
        )}
      </li>
    );
  };

  return (
    <section className={`flex min-h-0 flex-col rounded-[20px] border border-line bg-card text-[#f4f5f7] ${className}`} aria-labelledby="online-title">
      <header className="flex items-center justify-between px-5 pb-2 pt-4">
        <div>
          <h2 id="online-title" className="text-lg">
            Online now <span className="text-xs text-amber-300">👑 Plus</span>
          </h2>
          <p className="text-xs text-dim">
            {users === null ? 'Loading…' : `${waiting.length} looking for a chat · ${busy.length} chatting`}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-mute hover:bg-white/10 hover:text-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </header>
      {error && <p className="mx-4 mb-1 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200">{error}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
        {users !== null && users.length === 0 && <p className="py-10 text-center text-sm text-dim">Nobody else is online right now.</p>}
        {waiting.length > 0 && (
          <>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-dim">Looking for a chat</p>
            <ul className="space-y-2">{waiting.map(row)}</ul>
          </>
        )}
        {busy.length > 0 && (
          <>
            <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-dim">In a chat</p>
            <ul className="space-y-2">{busy.map(row)}</ul>
          </>
        )}
      </div>
      <p className="px-5 py-3 text-center text-xs text-dim">They decide whether to accept. Names and exact locations are never shown.</p>
    </section>
  );
}

/** "A Plus member wants to chat with you" with Accept / Decline. */
export function IncomingCallModal({ call }: { call: RandomCall }) {
  const trap = useFocusTrap();
  const { incomingCall, answerCall } = call;
  const left = useSecondsLeft(incomingCall?.expiresAt ?? null);
  if (!incomingCall) return null;
  const { from } = incomingCall;
  return (
    <div ref={trap} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="alertdialog" aria-modal="true" aria-labelledby="incoming-title">
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 text-center text-[#f4f5f7] shadow-2xl">
        <p className="text-5xl" aria-hidden>
          📞
        </p>
        <h2 id="incoming-title" className="mt-3 text-xl font-bold">
          {incomingCall.friend !== undefined
            ? `❤️ ${incomingCall.friend || 'Your friend'} wants to chat`
            : `${from.name || (from.plus ? '👑 A Plus member' : 'Someone')} wants to chat`}
        </h2>
        <p className="mt-2 flex items-center justify-center gap-1.5 text-mute">
          <span title={GENDER_LABEL[from.gender]}>{GENDER_ICON[from.gender]}</span>
          <span>{from.locationHidden ? '📍 Location hidden' : `${flagEmoji(from.country)} ${countryName(from.country)}`}</span>
          {from.verified && <VerifiedBadge />}
        </p>
        {from.bio && <p className="mt-1 text-sm italic text-mute">{from.avatar ? `${from.avatar} ` : ''}“{from.bio}”</p>}
        {from.sharedInterests.length > 0 && <p className="mt-1 text-sm text-dim">You both like {from.sharedInterests.join(', ')}</p>}
        <div className="mt-6 flex gap-3">
          <button onClick={() => answerCall(false)} className="flex-1 rounded-full bg-line py-3 font-semibold text-[#e6e8ec] hover:bg-line-2">
            Decline
          </button>
          <button onClick={() => answerCall(true)} className="flex-1 rounded-full bg-emerald-500 py-3 font-semibold text-white hover:bg-emerald-600">
            Accept
          </button>
        </div>
        <p className="mt-3 text-xs text-dim">Closes in {left}s</p>
      </div>
    </div>
  );
}
