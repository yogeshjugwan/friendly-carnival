'use client';

import { AGE_RANGES, ageLabel, MAX_NAME, type AgeRange, type UserSettings } from '@rc/shared';

const input =
  'h-[46px] w-full rounded-xl border border-line-2 bg-card-2 px-3.5 text-base text-[#f4f5f7] outline-none placeholder:text-faint focus:border-lime';

/** Profile card: just a name and an age range, shown to partners (live preview on top). */
export function ProfileEditor({ settings, onChange }: { settings: UserSettings; onChange: (patch: Partial<UserSettings>) => void }) {
  const name = settings.name ?? '';
  const age = settings.age ?? null;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3.5 rounded-[14px] border border-line bg-[#0b0d10] p-3.5">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-[14px] bg-gold font-display text-xl font-bold text-gold-bg" aria-hidden>
          {(name.trim()[0] ?? 'S').toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block text-xs text-dim">Partners see</span>
          <span className="block truncate font-semibold text-[#f4f5f7]">
            {name || 'Stranger'}
            {age && <span className="font-normal text-dim"> · {ageLabel(age)}</span>}
          </span>
        </span>
      </div>

      <label htmlFor="display-name" className="flex flex-col gap-1.5 text-[13px] text-mute">
        <span>
          Name <span className="text-faint">· a first name or nickname</span>
        </span>
        <input
          id="display-name"
          value={name}
          maxLength={MAX_NAME}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. Priya"
          autoComplete="nickname"
          className={input}
        />
      </label>

      <div className="flex flex-col gap-1.5 text-[13px] text-mute">
        <span id="age-label">
          Age <span className="text-faint">· a range, never your exact age</span>
        </span>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="age-label">
          {AGE_RANGES.map((a: AgeRange) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={age === a}
              onClick={() => onChange({ age: age === a ? null : a })}
              className={`h-11 rounded-xl text-[15px] font-semibold transition ${
                age === a ? 'bg-lime text-night' : 'bg-card-2 text-[#e6e8ec] hover:bg-[#232731]'
              }`}
            >
              {ageLabel(a)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
