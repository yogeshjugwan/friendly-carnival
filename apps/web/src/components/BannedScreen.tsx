'use client';

import { useState } from 'react';
import { MAX_APPEAL_LENGTH } from '@rc/shared';
import type { RandomCall } from '@/lib/useRandomCall';

function until(expiresAt: number | null): string {
  if (expiresAt === null) return 'This ban is permanent.';
  return `You can chat again ${new Date(expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.`;
}

export function BannedScreen({ call }: { call: RandomCall }) {
  const [message, setMessage] = useState('');
  const ban = call.ban;
  if (!ban) return null;

  return (
    <main className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 text-ink shadow-xl">
        <h1 className="text-2xl font-semibold">You can&apos;t use randomCall right now</h1>
        <p className="mt-3 text-slate-700">
          <span className="font-medium">Reason:</span> {ban.reason}
        </p>
        <p className="mt-1 text-slate-700">{until(ban.expiresAt)}</p>

        {ban.appealPending ? (
          <p className="mt-5 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Your appeal was received. A moderator will review it, usually within 24 hours.
          </p>
        ) : (
          <form
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault();
              call.appeal(message);
            }}
          >
            <label htmlFor="appeal" className="text-sm font-medium text-slate-600">
              Think this is a mistake? Tell us what happened.
            </label>
            <textarea
              id="appeal"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={MAX_APPEAL_LENGTH}
              className="mt-1 h-28 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
            <button
              type="submit"
              disabled={!message.trim()}
              className="mt-3 rounded-lg bg-brand px-5 py-2 font-semibold text-white disabled:opacity-40"
            >
              Send appeal
            </button>
          </form>
        )}
        <p className="mt-5 text-xs text-slate-500">Please follow the community guidelines: be respectful, no nudity, 18+ only.</p>
      </div>
    </main>
  );
}
