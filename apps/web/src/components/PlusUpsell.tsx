'use client';

import Link from 'next/link';

export const PLUS_FEATURES = [
  { icon: '⚧', title: 'Gender filter', body: 'Meet only girls or only boys.' },
  { icon: '🌍', title: 'Country filter', body: 'Chat with people from the country you pick.' },
  { icon: '🚫', title: 'No ads', body: 'No ad box and no ad between strangers.' },
  { icon: '👑', title: 'Plus badge', body: 'Partners see that you are a Plus member.' },
];

/** Modal shown when a free user tries a Plus feature. */
export function PlusUpsell({ onClose, reason }: { onClose: () => void; reason?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Upgrade to Plus">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-ink shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-600">randomCall Plus</p>
        <h2 className="mt-1 text-2xl font-bold">{reason ?? 'Choose who you meet'}</h2>
        <ul className="mt-4 space-y-3">
          {PLUS_FEATURES.map((f) => (
            <li key={f.title} className="flex gap-3">
              <span className="text-xl" aria-hidden>
                {f.icon}
              </span>
              <span>
                <span className="font-medium">{f.title}</span>
                <span className="block text-sm text-slate-500">{f.body}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 font-medium hover:bg-slate-100">
            Not now
          </button>
          <Link href="/plus" className="rounded-lg bg-amber-500 px-5 py-2 font-semibold text-white hover:bg-amber-600">
            👑 See plans
          </Link>
        </div>
      </div>
    </div>
  );
}
