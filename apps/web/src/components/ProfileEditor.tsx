'use client';

import { useState } from 'react';
import {
  AVATARS,
  ageLabel,
  MAX_BIO,
  MAX_INTEREST_LENGTH,
  MAX_INTERESTS,
  MAX_NAME,
  MAX_PROFILE_AGE,
  MIN_PROFILE_AGE,
  type UserSettings,
} from '@rc/shared';

const input =
  'h-12 w-full min-w-0 rounded-xl border border-line-2 bg-card px-3.5 text-[15px] text-[#f4f5f7] outline-none placeholder:text-faint focus:border-lime lg:h-[46px] lg:bg-[#120D18]';
const label = 'flex min-w-0 flex-col gap-1.5 text-[13px] text-mute';
const ghost =
  'inline-flex h-10 flex-none items-center rounded-xl border border-line-2 px-3.5 text-[13px] font-semibold text-[#e6e8ec] hover:border-[#4a3f5c] lg:h-11 lg:px-4 lg:text-sm';

/** Suggested interests on the phone chip picker (custom ones the user already has are shown too). */
const SUGGESTED = ['Music', 'Travel', 'Gaming', 'Movies', 'Sports', 'Food', 'Tech', 'Art'];

/** "Priya · 24 · bio" — what partners see. */
export function profilePreview(s: UserSettings) {
  const parts = [s.name?.trim() || 'Stranger'];
  if (s.age) parts.push(ageLabel(s.age));
  parts.push(s.bio?.trim() || (s.interests.length ? s.interests.slice(0, 3).join(', ') : 'no bio yet'));
  return parts.join(' · ');
}

/** Round avatar: the chosen emoji, or the name's initial. */
export function ProfileAvatar({ settings, size }: { settings: UserSettings; size: 'sm' | 'md' | 'lg' }) {
  const cls = { sm: 'h-14 w-14 text-[22px]', md: 'h-16 w-16 text-2xl', lg: 'h-[88px] w-[88px] text-[32px]' }[size];
  return (
    <span className={`grid flex-none place-items-center rounded-full bg-[linear-gradient(165deg,#3a4a6e,#1a2033)] font-display font-bold ${cls}`} aria-hidden>
      {settings.avatar ?? (settings.name?.trim()[0] ?? 'S').toUpperCase()}
    </span>
  );
}

/** Profile card fields: photo (emoji avatar), name, age, bio and interests, shown to partners. */
export function ProfileEditor({ settings, onChange }: { settings: UserSettings; onChange: (patch: Partial<UserSettings>) => void }) {
  const [picker, setPicker] = useState(false);
  const [draft, setDraft] = useState(settings.interests.join(', '));
  const name = settings.name ?? '';
  const bio = settings.bio ?? '';
  const interests = settings.interests;
  const has = (c: string) => interests.some((i) => i.toLowerCase() === c.toLowerCase());
  const chips = [...SUGGESTED, ...interests.filter((i) => !SUGGESTED.some((s) => s.toLowerCase() === i.toLowerCase()))];

  const toggleChip = (c: string) => {
    const list = has(c) ? interests.filter((i) => i.toLowerCase() !== c.toLowerCase()) : interests.length < MAX_INTERESTS ? [...interests, c] : interests;
    onChange({ interests: list });
    setDraft(list.join(', '));
  };

  const photoButton = (
    <button type="button" aria-expanded={picker} aria-controls="avatar-picker" onClick={() => setPicker(!picker)} className={ghost}>
      Change photo
    </button>
  );

  return (
    <div className="flex flex-col gap-3.5">
      {/* Desktop: avatar, name and preview in one row */}
      <div className="flex items-center gap-3.5 max-lg:hidden">
        <ProfileAvatar settings={settings} size="md" />
        <div className="min-w-0 flex-1">
          <strong className="block truncate font-display text-lg font-bold">{name.trim() || 'Your name'}</strong>
          <p className="m-0 mt-0.5 truncate text-[13px] text-mute">Partners see: {profilePreview(settings)}</p>
        </div>
        {photoButton}
      </div>

      {/* Phone: big centred avatar */}
      <div className="flex flex-col items-center gap-2 py-2 lg:hidden">
        <ProfileAvatar settings={settings} size="lg" />
        {photoButton}
      </div>

      {picker && (
        <div id="avatar-picker" role="radiogroup" aria-label="Profile photo" className="grid grid-cols-6 gap-1.5 rounded-[14px] border border-line bg-card-2 p-2 sm:grid-cols-8">
          <button
            type="button"
            role="radio"
            aria-checked={!settings.avatar}
            aria-label="Your initial"
            onClick={() => onChange({ avatar: null })}
            className={`h-11 rounded-xl border font-display text-[15px] font-bold ${!settings.avatar ? 'border-lime bg-pick' : 'border-transparent hover:bg-card'}`}
          >
            {(name.trim()[0] ?? 'S').toUpperCase()}
          </button>
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={settings.avatar === a}
              aria-label={`Avatar ${a}`}
              onClick={() => onChange({ avatar: a })}
              className={`h-11 rounded-xl border text-xl ${settings.avatar === a ? 'border-lime bg-pick' : 'border-transparent hover:bg-card'}`}
            >
              {a}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-[14px] border border-line bg-card px-3.5 py-3 text-[13px] text-mute lg:hidden">
        Partners see: <strong className="break-words text-[#f4f5f7]">{profilePreview(settings)}</strong>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2.5">
        <label htmlFor="display-name" className={label}>
          Name
          <input
            id="display-name"
            value={name}
            maxLength={MAX_NAME}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="A first name or nickname"
            autoComplete="nickname"
            className={input}
          />
        </label>
        <label htmlFor="display-age" className={label}>
          Age
          <input
            id="display-age"
            type="number"
            inputMode="numeric"
            min={MIN_PROFILE_AGE}
            max={MAX_PROFILE_AGE}
            placeholder="18+"
            value={settings.age ?? ''}
            onChange={(e) => onChange({ age: e.target.value === '' ? null : Math.trunc(Number(e.target.value)) })}
            className={input}
          />
        </label>
      </div>

      <label htmlFor="display-bio" className={label}>
        <span className="flex justify-between">
          About you
          <span aria-hidden>
            {bio.length}/{MAX_BIO}
          </span>
        </span>
        <input id="display-bio" value={bio} maxLength={MAX_BIO} onChange={(e) => onChange({ bio: e.target.value })} placeholder="One line about you" className={input} />
      </label>

      {/* Desktop: free text; phone: chips */}
      <label htmlFor="display-interests" className={`${label} max-lg:hidden`}>
        Interests
        <input
          id="display-interests"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onChange({
              interests: e.target.value
                .split(',')
                .map((s) => s.trim().slice(0, MAX_INTEREST_LENGTH))
                .filter(Boolean)
                .slice(0, MAX_INTERESTS),
            });
          }}
          placeholder="Music, travel, gaming…"
          className={input}
        />
      </label>
      <div className={`${label} lg:hidden`}>
        <span id="interests-label">Interests</span>
        <div role="group" aria-labelledby="interests-label" className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={has(c)}
              onClick={() => toggleChip(c)}
              className={`h-10 rounded-full border px-3.5 text-[13px] font-semibold ${has(c) ? 'border-lime bg-lime text-night' : 'border-line-2 bg-card text-[#e6e8ec]'}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
