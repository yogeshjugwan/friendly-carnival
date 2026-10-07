'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TOPICS, MAX_INTERESTS, type ChatMode, type Gender, type JoinPayload } from '@rc/shared';
import { useAuth } from '@/lib/auth';
import { loadSettings, onSettingsChange } from '@/lib/settings';
import { SiteFooter, SiteHeader } from './SiteHeader';
import { InstallButton } from './Pwa';
import { DailyRewardCard } from './DailyReward';

interface Props {
  online: number | null;
  onStart: (join: Omit<JoinPayload, 'mode' | 'hideCountry'>, mode: ChatMode, browse?: false | 'online' | 'friends') => void;
}

export function Landing({ online, onStart }: Props) {
  const { saveSettings, user } = useAuth();
  const isPlus = !!user?.plus.active;
  const [gender, setGender] = useState<Gender>('male');
  const [interestText, setInterestText] = useState('');
  // Topic room (optional), remembered in this browser.
  const [topic, setTopic] = useState<string | null>(null);
  useEffect(() => {
    try {
      setTopic(window.localStorage.getItem('rc.topic'));
    } catch {
      /* ignore */
    }
  }, []);
  const pickTopic = (id: string | null) => {
    setTopic(id);
    try {
      if (id) window.localStorage.setItem('rc.topic', id);
      else window.localStorage.removeItem('rc.topic');
    } catch {
      /* ignore */
    }
  };
  const [agreed, setAgreed] = useState(false);
  // Opened from a "your friend is online" notification.
  const [friendOnline, setFriendOnline] = useState(false);
  useEffect(() => setFriendOnline(new URLSearchParams(window.location.search).has('friends')), []);

  // Prefill from saved settings (the account's, when logged in).
  useEffect(() => {
    const apply = () => {
      const s = loadSettings();
      if (s.gender) setGender(s.gender);
      setInterestText(s.interests.join(', '));
    };
    apply();
    return onSettingsChange(apply);
  }, []);

  const interests = interestText
    .split(',')
    .map((i) => i.trim())
    .filter(Boolean)
    .slice(0, MAX_INTERESTS);

  const begin = (mode: ChatMode, browse: false | 'online' | 'friends' = false) => {
    if (!agreed) return;
    // Remember the choices for next time; don't block the chat on the network.
    void saveSettings({ ...loadSettings(), gender, interests }).catch(() => undefined);
    onStart({ gender, interests, topic }, mode, browse);
  };

  return (
    <main className="mx-auto flex min-h-full max-w-5xl flex-col px-4 py-6 sm:px-6">
      <SiteHeader online={online} />

      <section className="grid flex-1 items-center gap-10 py-10 md:grid-cols-2">
        <div>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">Meet someone new in seconds.</h1>
          <p className="mt-4 text-lg text-slate-300">
            One click, one stranger, face to face. Free random video chat right in your browser — no download, no sign-up.
          </p>
          <ul className="mt-6 space-y-2 text-slate-300">
            <li>✓ Video or text-only chat</li>
            <li>✓ Report, block and blur tools in every chat</li>
            <li>✓ Automatic nudity screening</li>
          </ul>
        </div>

        <form
          className="rounded-2xl bg-white p-6 text-ink shadow-xl"
          onSubmit={(e) => {
            e.preventDefault();
            begin('video');
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

          <p className="mt-4 text-sm font-medium text-slate-600">
            Topic <span className="font-normal text-slate-400">(optional — meet people into the same thing)</span>
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Topic">
            {TOPICS.map((t) => {
              const on = topic === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pickTopic(on ? null : t.id)}
                  className={`rounded-full border px-3 py-1 text-sm transition ${
                    on ? 'border-brand bg-brand text-white' : 'border-slate-300 text-slate-700 hover:border-brand'
                  }`}
                >
                  {t.emoji} {t.label}
                </button>
              );
            })}
          </div>

          <label className="mt-5 flex items-start gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>
              I confirm I am 18 or older and agree to the{' '}
              <Link href="/terms" className="text-brand underline" target="_blank">
                Terms of Use
              </Link>{' '}
              and{' '}
              <Link href="/guidelines" className="text-brand underline" target="_blank">
                Community Guidelines
              </Link>
              .
            </span>
          </label>

          <button
            type="submit"
            disabled={!agreed}
            className="mt-5 w-full rounded-lg bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start Chat
          </button>
          {user && friendOnline && (
            <p className="mt-3 text-center text-sm font-medium text-pink-600">❤️ A friend is online — tick the box above, then call them.</p>
          )}
          {user && (
            <button
              type="button"
              disabled={!agreed}
              onClick={() => begin('video', 'friends')}
              className={`mt-2 w-full rounded-lg border-2 border-pink-300 ${friendOnline ? 'ring-4 ring-pink-300/60' : ''} py-2.5 font-semibold text-pink-600 transition hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-50`}
            >
              ❤️ Call a friend
            </button>
          )}
          {isPlus && (
            <button
              type="button"
              disabled={!agreed}
              onClick={() => begin('video', 'online')}
              className="mt-2 w-full rounded-lg border-2 border-amber-400 py-2.5 font-semibold text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              👥 See who&apos;s online <span className="text-xs font-medium">👑 Plus</span>
            </button>
          )}
          <button
            type="button"
            disabled={!agreed}
            onClick={() => begin('voice')}
            className="mt-2 w-full rounded-lg border-2 border-emerald-300 py-2.5 font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            🎙️ Voice only — no camera
          </button>
          <button
            type="button"
            disabled={!agreed}
            onClick={() => begin('text')}
            className="mt-2 w-full rounded-lg py-2 text-sm font-medium text-brand hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Don&apos;t want your camera on? Start Text Chat
          </button>
        </form>
        {user && <DailyRewardCard className="mt-4" />}
        <InstallButton className="mt-4 text-center" />
      </section>

      <SiteFooter />
    </main>
  );
}
