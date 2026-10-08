'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TOPICS, MAX_INTERESTS, MAX_NAME, type ChatMode, type Gender, type JoinPayload } from '@rc/shared';
import { useAuth } from '@/lib/auth';
import { loadSettings, onSettingsChange } from '@/lib/settings';
import { SiteFooter, SiteHeader } from './SiteHeader';
import { InstallButton } from './Pwa';
import { DailyRewardCard } from './DailyReward';
import { AgeHoldNotice } from './AgeGate';
import { useI18n } from '@/lib/i18n';

interface Props {
  online: number | null;
  onStart: (join: Omit<JoinPayload, 'mode' | 'hideCountry'>, mode: ChatMode, browse?: false | 'online' | 'friends') => void;
}

export function Landing({ online, onStart }: Props) {
  const { t } = useI18n();
  const { saveSettings, user } = useAuth();
  const isPlus = !!user?.plus.active;
  const [gender, setGender] = useState<Gender>('male');
  const [interestText, setInterestText] = useState('');
  const [name, setName] = useState('');
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
      setName(s.name ?? '');
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
    void saveSettings({ ...loadSettings(), gender, interests, name: name.trim() }).catch(() => undefined);
    onStart({ gender, interests, topic }, mode, browse);
  };

  return (
    <main className="mx-auto flex min-h-full max-w-5xl flex-col px-4 py-6 sm:px-6">
      <SiteHeader online={online} />

      <section className="grid flex-1 items-center gap-10 py-10 md:grid-cols-2">
        <div>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">{t('landing.title')}</h1>
          <p className="mt-4 text-lg text-slate-300">{t('landing.subtitle')}</p>
          <ul className="mt-6 space-y-2 text-slate-300">
            <li>{t('landing.point1')}</li>
            <li>{t('landing.point2')}</li>
            <li>{t('landing.point3')}</li>
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <AgeHoldNotice />
          <form
            className="rounded-2xl bg-white p-6 text-ink shadow-xl"
            onSubmit={(e) => {
              e.preventDefault();
              begin('video');
            }}
          >
            <label className="text-sm font-medium text-slate-600" htmlFor="gender">
              {t('landing.iam')}
            </label>
            <select
              id="gender"
              value={gender}
              onChange={(e) => setGender(e.target.value as Gender)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
            >
              <option value="male">{t('gender.male')}</option>
              <option value="female">{t('gender.female')}</option>
              <option value="couple">{t('gender.couple')}</option>
            </select>

            <label className="mt-4 block text-sm font-medium text-slate-600" htmlFor="name">
              {t('landing.name')} <span className="font-normal text-slate-400">{t('landing.optional')}</span>
            </label>
            <input
              id="name"
              value={name}
              maxLength={MAX_NAME}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('landing.namePlaceholder')}
              autoComplete="nickname"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
            />

            <label className="mt-4 block text-sm font-medium text-slate-600" htmlFor="interests">
              {t('landing.interests')} <span className="font-normal text-slate-400">{t('landing.interestsHint')}</span>
            </label>
            <input
              id="interests"
              value={interestText}
              onChange={(e) => setInterestText(e.target.value)}
              placeholder={t('landing.interestsPlaceholder')}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
            />

            <p className="mt-4 text-sm font-medium text-slate-600">
              {t('landing.topic')} <span className="font-normal text-slate-400">{t('landing.topicHint')}</span>
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Topic">
              {TOPICS.map((tp) => {
                const on = topic === tp.id;
                return (
                  <button
                    key={tp.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => pickTopic(on ? null : tp.id)}
                    className={`rounded-full border px-3 py-1 text-sm transition ${
                      on ? 'border-brand bg-brand text-white' : 'border-slate-300 text-slate-700 hover:border-brand'
                    }`}
                  >
                    {tp.emoji} {t(`topic.${tp.id}`)}
                  </button>
                );
              })}
            </div>

            <label className="mt-5 flex items-start gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>
                {t('landing.agreePrefix')}{' '}
                <Link href="/terms" className="text-brand underline" target="_blank">
                  {t('footer.terms')}
                </Link>{' '}
                {t('landing.and')}{' '}
                <Link href="/guidelines" className="text-brand underline" target="_blank">
                  {t('footer.guidelines')}
                </Link>
                .
              </span>
            </label>

            <button
              type="submit"
              disabled={!agreed}
              className="mt-5 w-full rounded-lg bg-brand py-3 text-lg font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('landing.start')}
            </button>
            {user && friendOnline && (
              <p className="mt-3 text-center text-sm font-medium text-pink-600">{t('landing.friendOnline')}</p>
            )}
            {user && (
              <button
                type="button"
                disabled={!agreed}
                onClick={() => begin('video', 'friends')}
                className={`mt-2 w-full rounded-lg border-2 border-pink-300 ${friendOnline ? 'ring-4 ring-pink-300/60' : ''} py-2.5 font-semibold text-pink-600 transition hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {t('landing.callFriend')}
              </button>
            )}
            {isPlus && (
              <button
                type="button"
                disabled={!agreed}
                onClick={() => begin('video', 'online')}
                className="mt-2 w-full rounded-lg border-2 border-amber-400 py-2.5 font-semibold text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('landing.seeOnline')} <span className="text-xs font-medium">👑 Plus</span>
              </button>
            )}
            <button
              type="button"
              disabled={!agreed}
              onClick={() => begin('voice')}
              className="mt-2 w-full rounded-lg border-2 border-emerald-300 py-2.5 font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('landing.voice')}
            </button>
            <Link
              href="/rooms"
              className="mt-2 block w-full rounded-lg border-2 border-violet-300 py-2.5 text-center font-semibold text-violet-700 transition hover:bg-violet-50"
            >
              {t('landing.rooms')}
            </Link>
            <button
              type="button"
              disabled={!agreed}
              onClick={() => begin('text')}
              className="mt-2 w-full rounded-lg py-2 text-sm font-medium text-brand hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('landing.text')}
            </button>
          </form>
        </div>
        {user && <DailyRewardCard className="mt-4" />}
        <InstallButton className="mt-4 text-center" />
      </section>

      <SiteFooter />
    </main>
  );
}
