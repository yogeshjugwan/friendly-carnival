'use client';

import { AVATARS, MAX_BIO, MAX_NAME, type UserSettings } from '@rc/shared';

const input =
  'h-[46px] w-full rounded-xl border border-line-2 bg-card-2 px-3.5 text-base text-[#f4f5f7] outline-none placeholder:text-faint focus:border-lime';

/** Profile card: an emoji avatar and one line about you, shown to partners (live preview on top). */
export function ProfileEditor({ settings, onChange }: { settings: UserSettings; onChange: (patch: Partial<UserSettings>) => void }) {
  const avatar = settings.avatar ?? null;
  const bio = settings.bio ?? '';
  const name = settings.name ?? '';
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3.5 rounded-[14px] border border-line bg-[#0b0d10] p-3.5">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-[14px] bg-card-2 text-[28px]" aria-hidden>
          {avatar ?? '🙂'}
        </span>
        <span className="min-w-0">
          <span className="block text-xs text-dim">Partners see</span>
          <span className="block truncate font-semibold text-[#f4f5f7]">{name || 'Stranger'}</span>
          <span className="block truncate text-[13px] text-dim">{bio || 'No bio yet'}</span>
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
        <span id="avatar-label">Avatar</span>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-2" role="radiogroup" aria-labelledby="avatar-label">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={avatar === a}
              onClick={() => onChange({ avatar: avatar === a ? null : a })}
              className={`flex aspect-square min-h-11 items-center justify-center rounded-xl text-2xl transition ${
                avatar === a ? 'bg-[#232731] outline-2 outline-offset-2 outline-lime' : 'bg-card-2 hover:bg-[#232731]'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <label htmlFor="bio" className="flex flex-col gap-1.5 text-[13px] text-mute">
        <span>
          About you <span className="text-faint">· one line, no links or handles</span>
        </span>
        <input
          id="bio"
          value={bio}
          maxLength={MAX_BIO}
          onChange={(e) => onChange({ bio: e.target.value })}
          placeholder="e.g. Chai lover, learning guitar, ask me about cricket"
          className={input}
        />
        <span className="self-end text-[11px] text-faint">
          {bio.length}/{MAX_BIO}
        </span>
      </label>
    </div>
  );
}
