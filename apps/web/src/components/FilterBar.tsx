'use client';

import { useEffect, useMemo, useState } from 'react';
import { NO_FILTERS, type Gender, type MatchFilters } from '@rc/shared';
import { useAuth } from '@/lib/auth';
import { countryOptions } from '@/lib/countries';
import { loadSettings, onSettingsChange } from '@/lib/settings';
import { ChevronDownIcon } from './icons';
import { PlusUpsell } from './PlusUpsell';

/** Quick "only girls / only boys" toggle; the gender filters are a Plus feature. */
const GENDERS: { value: Gender | 'any'; label: string; icon?: string }[] = [
  { value: 'any', label: 'Everyone' },
  { value: 'female', label: 'Girls', icon: '👩' },
  { value: 'male', label: 'Boys', icon: '👨' },
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
    <label className={`relative inline-flex items-center ${wide ? 'min-w-0 flex-1 sm:flex-none' : ''}`}>
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
        className={`appearance-none rounded-xl bg-slate-800 py-2 pl-3 pr-12 text-xs font-medium text-slate-100 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-brand sm:pl-4 sm:text-sm ${wide ? 'w-full sm:w-auto sm:max-w-[11rem]' : ''}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2.5 flex items-center gap-0.5 text-slate-400">
        {!isPlus && <span className="text-[11px]" title="Plus feature">👑</span>}
        <ChevronDownIcon />
      </span>
    </label>
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <div role="radiogroup" aria-label="Who you want to meet" className="inline-flex rounded-xl bg-slate-800 p-0.5">
          {GENDERS.map((g) => {
            const active = (isPlus ? filters.gender : 'any') === g.value;
            return (
              <button
                key={g.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => (active ? undefined : change({ gender: g.value }))}
                className={`flex items-center gap-1 rounded-[0.6rem] px-2 py-1.5 text-xs font-medium transition sm:px-3 sm:text-sm ${
                  active ? 'bg-brand text-white shadow' : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {g.icon && <span aria-hidden>{g.icon}</span>}
                {g.value === 'any' ? (
                  <>
                    <span className="sm:hidden">All</span>
                    <span className="hidden sm:inline">{g.label}</span>
                  </>
                ) : (
                  g.label
                )}
                {g.value !== 'any' && !isPlus && (
                  <span className="text-[10px]" title="Plus feature" aria-label="Plus feature">
                    👑
                  </span>
                )}
              </button>
            );
          })}
        </div>
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
