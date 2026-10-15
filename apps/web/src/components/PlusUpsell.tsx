'use client';

import { useState } from 'react';
import { PlusModal } from './PlusModal';
import { StateActions, StateCard } from './StateCard';
import { BoltIcon, ClockIcon, CrownIcon, EyeOffIcon, GlobeIcon, UsersIcon } from './UiIcons';

export const PLUS_FEATURES = [
  { icon: <UsersIcon className="h-4 w-4" />, title: 'Gender filter', body: 'Meet only girls or only boys.' },
  { icon: <GlobeIcon className="h-4 w-4" />, title: 'Country filter', body: 'Chat with people from the country you pick.' },
  { icon: <ClockIcon className="h-4 w-4" />, title: 'Online list', body: 'See who is online now and call them directly.' },
  { icon: <BoltIcon className="h-4 w-4" />, title: 'Unlimited matches', body: 'No daily limit and no ad before each match.' },
  { icon: <EyeOffIcon className="h-4 w-4" />, title: 'No ads', body: 'No ad box and no ad between strangers.' },
  { icon: <CrownIcon className="h-4 w-4" />, title: 'Plus badge', body: 'Partners see that you are a Plus member.' },
];

/** Gold icon tile + title + one line per feature (the modal and the Plus page). */
export function PlusFeatureList({ className = '' }: { className?: string }) {
  return (
    <ul className={`m-0 flex list-none flex-col gap-3 p-0 ${className}`}>
      {PLUS_FEATURES.map((f) => (
        <li key={f.title} className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-gold-bg text-gold">{f.icon}</span>
          <span className="min-w-0 text-sm">
            <span className="font-semibold text-[#f4f5f7]">{f.title}</span>
            <span className="block text-[13px] text-dim">{f.body}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Shown when a free user tries a Plus feature: the nudge, then the plan picker. */
export function PlusUpsell({ onClose, reason, body }: { onClose: () => void; reason?: string; body?: string }) {
  const [plusOpen, setPlusOpen] = useState(false);
  if (plusOpen) return <PlusModal onClose={onClose} />;
  return (
    <StateCard
      overlay
      icon="crown"
      tone="gold"
      titleId="plus-nudge-title"
      title={reason ?? 'Want to choose who you meet?'}
      body={body ?? 'With Plus, pick gender and country so every match fits.'}
    >
      <StateActions
        actions={[
          { label: 'Get Plus', kind: 'gold', onClick: () => setPlusOpen(true) },
          { label: 'Keep matching', kind: 'outline', onClick: onClose },
        ]}
      />
    </StateCard>
  );
}
