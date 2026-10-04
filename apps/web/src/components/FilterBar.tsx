'use client';

import { useEffect, useMemo, useState } from 'react';
import { NO_FILTERS, type Gender, type MatchFilters } from '@rc/shared';
import { useAuth } from '@/lib/auth';
import { countryOptions } from '@/lib/countries';
import { loadSettings, onSettingsChange } from '@/lib/settings';
import { ChevronDownIcon } from './icons';
import { PlusUpsell } from './PlusUpsell';

const GENDERS: { value: Gender | 'any'; label: string }[] = [
  { value: 'any', label: 'Everyone' },
  { value: 'female', label: 'Females only' },
  { value: 'male', label: 'Males only' },
  { value: 'couple', label: 'Couples only' },
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
    value: string,
    onChange: (v: string) => void,
    options: { value: string; label: string }[],
    wide = false,
  ) => (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{label}</span>
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
        className={`appearance-none rounded-xl bg-slate-800 py-2 pl-4 pr-9 text-sm font-medium text-slate-100 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-brand ${wide ? 'max-w-[11rem]' : ''}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 flex items-center gap-1 text-slate-400">
        {!isPlus && <span className="text-[11px]" title="Plus feature">👑</span>}
        <ChevronDownIcon />
      </span>
    </label>
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {pill('Gender filter', isPlus ? filters.gender : 'any', (v) => change({ gender: v as MatchFilters['gender'] }), GENDERS)}
        {pill(
          'Country filter',
          isPlus ? filters.country : 'any',
          (v) => change({ country: v }),
          [{ value: 'any', label: 'All countries' }, ...countries.map((c) => ({ value: c.code, label: c.name }))],
          true,
        )}
      </div>
      {upsell && <PlusUpsell onClose={() => setUpsell(false)} />}
    </>
  );
}
