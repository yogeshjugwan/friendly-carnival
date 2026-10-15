'use client';

import { useState } from 'react';
import { NO_FILTERS } from '@rc/shared';
import { useAuth } from '@/lib/auth';
import { loadSettings } from '@/lib/settings';
import { type RandomCall } from '@/lib/useRandomCall';
import { COUNTRY_OPTS, FilterChip, GENDER_OPTS } from '../Landing';
import { PriorityButton, WidenSearch } from './SearchStates';

/** Matching (final design): ripples around a gradient camera, "Finding someone…", and the Plus filters. */
export function MatchPanel({ call, onPlus }: { call: RandomCall; onPlus: () => void }) {
  const { user, saveSettings } = useAuth();
  const isPlus = !!user?.plus.active;
  const [filters, setFilters] = useState(() => loadSettings().filters ?? NO_FILTERS);
  const [menu, setMenu] = useState<'g' | 'c' | null>(null);
  const pick = (patch: Partial<typeof filters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    setMenu(null);
    void saveSettings({ ...loadSettings(), filters: next }).catch(() => undefined);
  };
  const open = (which: 'g' | 'c') => (isPlus ? setMenu(menu === which ? null : which) : onPlus());
  if (call.status === 'browsing') {
    return (
      <p className="max-w-xs px-4 text-center text-sm text-mute sm:text-base">
        Pick someone from <span className="font-semibold text-white">Online</span> or <span className="font-semibold text-white">Friends</span> to call, or press{' '}
        <span className="font-semibold text-white">Next</span> for a random stranger.
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2.5 px-4 text-center sm:gap-3.5">
      <div className="relative h-[110px] w-full sm:h-[220px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="rc-ripple-sm absolute inset-0 m-auto h-[120px] w-[120px] rounded-full border-2 border-lime sm:h-[140px] sm:w-[140px]" style={{ animationDelay: `${i}s` }} />
        ))}
        <span className="absolute inset-0 m-auto grid h-16 w-16 place-items-center rounded-full bg-lime sm:h-[88px] sm:w-[88px]">
          <svg viewBox="0 0 24 24" className="h-7 w-7 sm:h-9 sm:w-9" fill="none" stroke="#0b0d10" strokeWidth={2.2} aria-hidden>
            <rect x="2" y="6" width="14" height="12" rx="2" />
            <path d="M16 10l6-3v10l-6-3" />
          </svg>
        </span>
      </div>
      <h1 className="m-0 font-display text-2xl font-bold sm:text-[34px]" role="status">
        {call.status === 'connecting' ? 'Connecting…' : 'Finding someone…'}
      </h1>
      <p className="m-0 text-sm text-mute sm:text-[15px]">
        {call.status === 'searching' && call.lastLeftReason ? 'They left — finding someone new · ' : ''}
        {call.online !== null ? <span className="max-sm:hidden">{Math.max(call.online - 1, 0).toLocaleString()} online · </span> : null}
        <span className="sm:hidden">Usually</span>
        <span className="max-sm:hidden">usually</span> under 5 seconds
      </p>
      <div className="mt-1.5 flex items-center gap-2 text-left max-sm:hidden">
        <FilterChip label="Gender" value={filters.gender} options={GENDER_OPTS} locked={!isPlus} open={menu === 'g'} onOpen={() => open('g')} onPick={(v) => pick({ gender: v })} />
        <FilterChip label="Country" value={filters.country} options={COUNTRY_OPTS} locked={!isPlus} open={menu === 'c'} onOpen={() => open('c')} onPick={(v) => pick({ country: v })} />
      </div>
      {!isPlus && <p className="m-0 text-[13px] text-[#cdb766] max-sm:hidden">Filters are a Plus feature</p>}
      {call.searchingLong && <WidenSearch call={call} />}
      {call.status === 'searching' && <PriorityButton call={call} />}
    </div>
  );
}
