'use client';

import { AVATARS, MAX_BIO, MAX_NAME, type UserSettings } from '@rc/shared';

/** Profile card: an emoji avatar and one line about you, shown to partners. */
export function ProfileEditor({ settings, onChange }: { settings: UserSettings; onChange: (patch: Partial<UserSettings>) => void }) {
  const avatar = settings.avatar ?? null;
  const bio = settings.bio ?? '';
  const name = settings.name ?? '';
  return (
    <div className="mt-3">
      <label htmlFor="display-name" className="block text-sm font-medium">
        Your name <span className="font-normal text-slate-500">(what people see — a first name or nickname)</span>
      </label>
      <input
        id="display-name"
        value={name}
        maxLength={MAX_NAME}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="e.g. Priya"
        autoComplete="nickname"
        className="mb-4 mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <p className="text-sm font-medium">Avatar</p>
      <div className="mt-2 grid grid-cols-8 gap-1.5 sm:grid-cols-12" role="radiogroup" aria-label="Avatar">
        {AVATARS.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={avatar === a}
            onClick={() => onChange({ avatar: avatar === a ? null : a })}
            className={`flex aspect-square items-center justify-center rounded-lg text-2xl transition ${
              avatar === a ? 'bg-brand/15 ring-2 ring-brand' : 'bg-slate-100 hover:bg-slate-200'
            }`}
          >
            {a}
          </button>
        ))}
      </div>
      <label htmlFor="bio" className="mt-4 block text-sm font-medium">
        About you <span className="font-normal text-slate-500">(one line, no links or handles)</span>
      </label>
      <input
        id="bio"
        value={bio}
        maxLength={MAX_BIO}
        onChange={(e) => onChange({ bio: e.target.value })}
        placeholder="e.g. Chai lover, learning guitar, ask me about cricket"
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <p className="mt-1 text-right text-xs text-slate-500">
        {bio.length}/{MAX_BIO}
      </p>
      <div className="mt-2 flex items-center gap-3 rounded-xl bg-slate-900 p-3 text-white">
        <span className="text-3xl">{avatar ?? '🙂'}</span>
        <span className="min-w-0">
          <span className="block text-xs text-slate-400">Partners see</span>
          <span className="block truncate font-semibold">{name || 'Stranger'}</span>
          <span className="block truncate text-sm">{bio || 'No bio yet'}</span>
        </span>
      </div>
    </div>
  );
}
