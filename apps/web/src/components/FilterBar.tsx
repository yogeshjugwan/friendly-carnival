'use client';

import { useEffect, useMemo, useState } from 'react';
import { NO_FILTERS, type Gender, type MatchFilters } from '@rc/shared';
import { useAuth } from '@/lib/auth';
import { countryOptions } from '@/lib/countries';
import { loadSettings, onSettingsChange } from '@/lib/settings';
import { PlusUpsell } from './PlusUpsell';

const GENDERS: { value: Gender | 'any'; label: string }[] = [
  { value: 'any', label: 'Everyone' },
  { value: 'female', label: 'Females only' },
  { value: 'male', label: 'Males only' },
  { value: 'couple', label: 'Couples only' },
];

/** Gender and country filters (Plus). Free users get an upgrade prompt instead. */
export function FilterBar({ compact = false }: { compact?: boolean }) {
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

  const select = 'rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-white';
  return (
    <>
      <div className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
        <label className="flex items-center gap-1.5">
          <span className="text-slate-400">{isPlus ? 'Gender' : '👑 Gender'}</span>
          <select
            value={isPlus ? filters.gender : 'any'}
            onChange={(e) => change({ gender: e.target.value as MatchFilters['gender'] })}
            onMouseDown={(e) => {
              if (!isPlus) {
                e.preventDefault();
                setUpsell(true);
              }
            }}
            className={select}
            aria-label="Gender filter"
          >
            {GENDERS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-slate-400">{isPlus ? 'Country' : '👑 Country'}</span>
          <select
            value={isPlus ? filters.country : 'any'}
            onChange={(e) => change({ country: e.target.value })}
            onMouseDown={(e) => {
              if (!isPlus) {
                e.preventDefault();
                setUpsell(true);
              }
            }}
            className={`${select} max-w-[9rem]`}
            aria-label="Country filter"
          >
            <option value="any">All countries</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {upsell && <PlusUpsell onClose={() => setUpsell(false)} />}
    </>
  );
}
