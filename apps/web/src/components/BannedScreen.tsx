'use client';

import { useState } from 'react';
import { MAX_APPEAL_LENGTH } from '@rc/shared';
import { useAuth } from '@/lib/auth';
import type { RandomCall } from '@/lib/useRandomCall';
import { StateActions, StateCard } from './StateCard';

function until(expiresAt: number | null): string {
  if (expiresAt === null) return 'Permanent';
  return new Date(expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function BannedScreen({ call }: { call: RandomCall }) {
  const { user, logout } = useAuth();
  const [message, setMessage] = useState('');
  const [appealing, setAppealing] = useState(false);
  const ban = call.ban;
  if (!ban) return null;

  return (
    <main className="h-full">
      <StateCard
        icon="ban"
        tone="danger"
        title="Your account is suspended"
        body="You broke our Community Guidelines. Repeat breaks lead to a permanent ban."
      >
        <div className="rounded-[14px] border border-[#4A2424] bg-[#2A1616] px-4 py-3.5 text-left text-sm leading-[1.7] text-[#FFD3CE]">
          <div>
            <span className="text-mute">Reason</span> · {ban.reason}
          </div>
          <div>
            <span className="text-mute">Until</span> · {until(ban.expiresAt)}
          </div>
        </div>

        {ban.appealPending ? (
          <p className="m-0 rounded-xl bg-pick px-4 py-3 text-sm text-lime">
            Your appeal was received. A moderator will review it, usually within 24 hours.
          </p>
        ) : (
          appealing && (
            <div>
              <label htmlFor="appeal" className="text-sm font-medium text-mute">
                Think this is a mistake? Tell us what happened.
              </label>
              <textarea
                id="appeal"
                autoFocus
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={MAX_APPEAL_LENGTH}
                className="mt-1 h-28 w-full rounded-xl border border-line-2 bg-card-2 px-3 py-2"
              />
            </div>
          )
        )}

        <StateActions
          actions={[
            ...(ban.appealPending
              ? []
              : appealing
                ? [{ label: 'Send appeal', kind: 'primary' as const, disabled: !message.trim(), onClick: () => call.appeal(message) }]
                : [{ label: 'Appeal', kind: 'primary' as const, onClick: () => setAppealing(true) }]),
            { label: 'Read the Guidelines', kind: 'outline', href: '/guidelines' },
            ...(user ? [{ label: 'Log out', kind: 'link' as const, onClick: () => void logout() }] : []),
          ]}
        />
      </StateCard>
    </main>
  );
}
