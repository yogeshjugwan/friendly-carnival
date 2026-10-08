'use client';

import { useEffect, useMemo, useState } from 'react';
import { NO_FILTERS, type Gender, type MatchFilters } from '@rc/shared';
import { useAuth } from '@/lib/auth';
import { countryOptions } from '@/lib/countries';
import { loadSettings, onSettingsChange } from '@/lib/settings';
import { ChevronDownIcon } from './icons';
import { PlusUpsell } from './PlusUpsell';

const GENDERS: { value: Gender | 'any'; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'female', label: 'Girls' },
  { value: 'male', label: 'Boys' },
];

/** Gender and country filters (Plus). Free users get an upgrade prompt instead. */
export function FilterBar() {
  const { user, saveSettings } = useAuth();
  const isPlus = !!user?.plus.active;
  const [filters, setFilters] = useState<MatchFilters>(NO_FILTERS);
  const [upsell, setUpsell] = useState(false);
  const countries = useMemo(() => countryOptions(), []);

  useEffect(() => {
    const sync = () => setFilters(loadSettings().filters);
    sync();
    return onSettingsChange(sync);
  }, []);

  const change = (patch: Partial<MatchFilters>) => {
    if (!isPlus) return setUpsell(true);
    const next = { ...filters, ...patch };
    setFilters(next);
    void saveSettings({ ...loadSettings(), filters: next }).catch(() => undefined);
  };

  const pill = (
    label: string,
    short: string,
    value: string,
    onChange: (v: string) => void,
    options: { value: string; label: string }[],
    wide = false,
  ) => (
    <label className={`relative flex h-9 items-center gap-2 rounded-lg pl-3 text-sm text-[#e8ebf2] hover:bg-card-2 ${wide ? 'min-w-0' : 'shrink-0'} ${isPlus ? 'pr-7' : 'pr-11'}`}>
      <span className="shrink-0 text-xs text-dim max-sm:hidden" aria-hidden>
        {short}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onMouseDown={(e) => {
          if (!isPlus) {
            e.preventDefault();
            setUpsell(true);
          }
        }}
        aria-label={label}
        className={`min-w-0 cursor-pointer appearance-none truncate bg-transparent text-sm focus:outline-none ${wide ? 'max-w-[8.5rem] sm:max-w-[10rem]' : ''}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="text-ink">
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 flex items-center gap-0.5 text-dim">
        {!isPlus && (
          <span className="text-[11px]" title="Plus feature">
            👑
          </span>
        )}
        <ChevronDownIcon />
      </span>
    </label>
  );
  const divider = <span className="h-5 w-px shrink-0 bg-line-2" aria-hidden />;

  return (
    <>
      <div aria-label="Match filters" className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-line bg-card p-1">
        {pill('Gender filter', 'Gender', isPlus ? filters.gender : 'any', (v) => change({ gender: v as MatchFilters['gender'] }), GENDERS)}
        {divider}
        {pill(
          'Country filter',
          'Country',
          isPlus ? filters.country : 'any',
          (v) => change({ country: v }),
          [{ value: 'any', label: 'All countries' }, ...countries.map((c) => ({ value: c.code, label: c.name }))],
          true,
        )}
        {divider}
        {pill(
          'Verified filter',
          'Who',
          isPlus && filters.verifiedOnly ? 'verified' : 'all',
          (v) => change({ verifiedOnly: v === 'verified' }),
          [
            { value: 'all', label: 'Anyone' },
            { value: 'verified', label: '✓ Verified only' },
          ],
        )}
      </div>
      {upsell && <PlusUpsell onClose={() => setUpsell(false)} />}
    </>
  );
}
