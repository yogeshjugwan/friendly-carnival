'use client';

import { useState } from 'react';
import { MAX_INTERESTS, type ChatMode, type Gender, type JoinPayload } from '@rc/shared';

interface Props {
  online: number | null;
  onStart: (join: Omit<JoinPayload, 'mode'>, mode: ChatMode) => void;
}

export function Landing({ online, onStart }: Props) {
  const [gender, setGender] = useState<Gender>('male');
  const [interestText, setInterestText] = useState('');
  const [agreed, setAgreed] = useState(false);

  const interests = interestText
    .split(',')
    .map((i) => i.trim())
    .filter(Boolean)
    .slice(0, MAX_INTERESTS);

  return (
    <main className="mx-auto flex min-h-full max-w-5xl flex-col px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between">
        <span className="text-2xl font-semibold tracking-tight">
          random<span className="text-brand">Call</span>
        </span>
        <span className="flex items-center gap-2 text-sm text-slate-300">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          {online === null ? 'Connecting…' : `${online.toLocaleString()} online`}
        </span>
      </header>

      <section className="grid flex-1 items-center gap-10 py-10 md:grid-cols-2">
        <div>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">Meet someone new in seconds.</h1>
          <p className="mt-4 text-lg text-slate-300">
            One click, one stranger, face to face. Free random video chat right in your browser — no download, no sign-up.
          </p>
        </div>

        <form
          className="rounded-2xl bg-white p-6 text-ink shadow-xl"
          onSubmit={(e) => {
            e.preventDefault();
            if (agreed) onStart({ gender, interests }, 'video');
          }}
        >
          <label className="text-sm font-medium text-slate-600" htmlFor="gender">
            I am
          </label>
          <select
            id="gender"
            value={gender}
            onChange={(e) => setGender(e.target.value as Gender)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="couple">We are a couple</option>
          </select>

          <label className="mt-4 block text-sm font-medium text-slate-600" htmlFor="interests">
            Interests <span className="font-normal text-slate-400">(optional, comma separated)</span>
          </label>
          <input
            id="interests"
            value={interestText}
            onChange={(e) => setInterestText(e.target.value)}
            placeholder="music, travel, cricket"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
          />

          <label className="mt-5 flex items-start gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>I confirm I am 18 or older and agree to the Terms of Use and community guidelines.</span>
          </label>

          <button
            type="submit"
            disabled={!agreed}
            className="mt-5 w-full rounded-lg bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start Chat
          </button>
          <button
            type="button"
            disabled={!agreed}
            onClick={() => agreed && onStart({ gender, interests }, 'text')}
            className="mt-2 w-full rounded-lg py-2 text-sm font-medium text-brand hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Don&apos;t want your camera on? Start Text Chat
          </button>
        </form>
      </section>
    </main>
  );
}
