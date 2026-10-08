'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TOPICS, MAX_INTERESTS, MAX_NAME, type ChatMode, type Gender, type JoinPayload } from '@rc/shared';
import { useAuth } from '@/lib/auth';
import { loadSettings, onSettingsChange } from '@/lib/settings';
import { SiteFooter, SiteHeader } from './SiteHeader';
import { DailyRewardCard } from './DailyReward';
import { AgeHoldNotice } from './AgeGate';
import { useI18n } from '@/lib/i18n';
import { BoltIcon, BubbleLinesIcon, CameraIcon, ChevronRightIcon, CrownIcon, EyeOffIcon, HeartIcon, MicIcon2, ShieldIcon, UsersIcon } from './UiIcons';

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

  const genders: [Gender, string][] = [
    ['male', t('gender.male')],
    ['female', t('gender.female')],
    ['couple', t('gender.coupleShort')],
  ];
  const label = 'flex flex-col gap-2 text-[13px] font-medium text-mute';
  const field =
    'h-[46px] w-full rounded-xl border border-line-2 bg-night px-3.5 text-[15px] text-[#e8ebf2] placeholder:text-[#6b7385] focus:outline-2 focus:outline-offset-1 focus:outline-lime';
  const alt =
    'flex items-center gap-3 rounded-[14px] border border-line-2 bg-card-2 p-3.5 text-left text-[#e8ebf2] transition hover:border-[#384056] disabled:cursor-not-allowed disabled:opacity-50';
  const altIcon = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]';

  return (
    <main className="flex min-h-dvh flex-col px-4 sm:px-6">
      <SiteHeader online={online} />

      {/* Phones: pitch → start card → features & streak. Desktop: pitch and features left, start card right. */}
      <div className="mx-auto grid w-full max-w-[1200px] flex-1 content-start gap-6 pb-12 pt-6 sm:gap-8 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:grid-rows-[auto_1fr] lg:gap-x-14">
        {/* Pitch */}
        <section className="flex min-w-0 flex-col gap-4 sm:gap-6 lg:col-start-1 lg:row-start-1 lg:pt-6">
          <span className="flex items-center gap-2 self-start rounded-full border border-[#2b3320] bg-[#141a0c] px-3 py-1.5 text-[13px] font-medium text-lime">
            <BoltIcon className="h-3.5 w-3.5" />
            {t('landing.badge')}
          </span>
          <h1 className="m-0 font-display text-[44px] font-extrabold leading-none tracking-[-0.035em] text-[#f4f6fa] sm:text-[72px] sm:leading-[0.98]">
            {t('landing.titleA')} <span className="text-lime">{t('landing.titleB')}</span>
          </h1>
          <p className="m-0 max-w-[480px] text-[15px] leading-relaxed text-mute sm:text-lg">{t('landing.subtitle')}</p>
        </section>

        {/* Right: the start card */}
        <section aria-label="Start a chat" className="flex min-w-0 flex-col gap-3 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <AgeHoldNotice />
          <form
            className="flex flex-col gap-[22px] rounded-3xl border border-[#222838] bg-card p-5 sm:p-7"
            onSubmit={(e) => {
              e.preventDefault();
              begin('video');
            }}
          >
            <div className="flex flex-col gap-2.5">
              <span className="text-[13px] font-medium text-mute" id="gender-label">
                {t('landing.iam')}
              </span>
              <div role="radiogroup" aria-labelledby="gender-label" className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-night p-1">
                {genders.map(([value, text]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={gender === value}
                    onClick={() => setGender(value)}
                    className={`h-10 rounded-[9px] text-sm font-semibold transition ${gender === value ? 'bg-line-2 text-[#f4f6fa]' : 'text-dim hover:text-[#d6dae3]'}`}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label} htmlFor="name">
                <span>
                  {t('landing.name')} <span className="font-normal text-[#6b7385]">· {t('landing.optional').replace(/[()]/g, '')}</span>
                </span>
                <input
                  id="name"
                  value={name}
                  maxLength={MAX_NAME}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('landing.namePlaceholder')}
                  autoComplete="nickname"
                  className={field}
                />
              </label>
              <label className={label} htmlFor="interests">
                <span>
                  {t('landing.interests')} <span className="font-normal text-[#6b7385]">· {t('landing.optional').replace(/[()]/g, '')}</span>
                </span>
                <input
                  id="interests"
                  value={interestText}
                  onChange={(e) => setInterestText(e.target.value)}
                  placeholder={t('landing.interestsPlaceholder')}
                  className={field}
                />
              </label>
            </div>

            <div className="flex flex-col gap-2.5">
              <span className="text-[13px] font-medium text-mute" id="topic-label">
                {t('landing.topic')} <span className="font-normal text-[#6b7385]">{t('landing.topicHint2')}</span>
              </span>
              <div
                role="radiogroup"
                aria-labelledby="topic-label"
                className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
              >
                {TOPICS.map((tp) => {
                  const on = topic === tp.id;
                  return (
                    <button
                      key={tp.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => pickTopic(on ? null : tp.id)}
                      className={`h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition ${
                        on ? 'border-lime bg-lime text-night' : 'border-[#2b3243] text-[#d6dae3] hover:border-[#3a4257]'
                      }`}
                    >
                      {t(`topic.${tp.id}`)}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex items-start gap-2.5 text-[13px] leading-normal text-mute">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-lime"
              />
              <span>
                {t('landing.agreePrefix')}{' '}
                <Link href="/terms" className="text-lime underline-offset-2 hover:text-lime-hover hover:underline" target="_blank">
                  {t('footer.terms')}
                </Link>{' '}
                {t('landing.and')}{' '}
                <Link href="/guidelines" className="text-lime underline-offset-2 hover:text-lime-hover hover:underline" target="_blank">
                  {t('footer.guidelines')}
                </Link>
                .
              </span>
            </label>

            <button
              type="submit"
              disabled={!agreed}
              className="flex h-14 items-center justify-center gap-2.5 rounded-2xl bg-lime text-[17px] font-bold tracking-[-0.01em] text-night transition hover:bg-lime-hover disabled:cursor-not-allowed disabled:opacity-40 sm:h-[60px] sm:text-lg"
            >
              <CameraIcon className="h-5 w-5" strokeWidth={2.4} />
              {t('landing.startVideo')}
            </button>
            {!agreed && <p className="-mt-3 text-center text-xs text-dim">Tick the box above to start.</p>}

            {user && friendOnline && <p className="-mt-2 text-center text-sm font-medium text-[#ff7aa8]">{t('landing.friendOnline')}</p>}

            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.06em] text-[#6b7385]">
              <span className="h-px flex-1 bg-[#222838]" />
              <span>{t('landing.or')}</span>
              <span className="h-px flex-1 bg-[#222838]" />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" disabled={!agreed} onClick={() => begin('voice')} className={alt}>
                <span className={`${altIcon} bg-[#12241b]`}>
                  <MicIcon2 color="#3ddc84" />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-semibold">{t('landing.voiceTitle')}</span>
                  <span className="text-xs text-dim max-sm:hidden">{t('landing.voiceSub')}</span>
                </span>
              </button>
              <button type="button" disabled={!agreed} onClick={() => begin('text')} className={alt}>
                <span className={`${altIcon} bg-[#13202e]`}>
                  <BubbleLinesIcon color="#5ab0ff" />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-semibold">{t('landing.textTitle')}</span>
                  <span className="text-xs text-dim max-sm:hidden">{t('landing.textSub')}</span>
                </span>
              </button>
              <Link href="/rooms" className={alt}>
                <span className={`${altIcon} bg-[#1f1830]`}>
                  <UsersIcon color="#b18cff" />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-semibold">{t('landing.roomsTitle')}</span>
                  <span className="text-xs text-dim max-sm:hidden">{t('landing.roomsSub')}</span>
                </span>
              </Link>
              {user ? (
                <button
                  type="button"
                  disabled={!agreed}
                  onClick={() => begin('video', 'friends')}
                  className={`${alt} ${friendOnline ? 'ring-2 ring-[#ff7aa8]' : ''}`}
                >
                  <span className={`${altIcon} bg-[#2a1520]`}>
                    <HeartIcon color="#ff7aa8" />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-semibold">{t('landing.friendTitle')}</span>
                    <span className="text-xs text-dim max-sm:hidden">{t('landing.friendSub')}</span>
                  </span>
                </button>
              ) : (
                <Link href="/login?next=/" className={alt}>
                  <span className={`${altIcon} bg-[#2a1520]`}>
                    <HeartIcon color="#ff7aa8" />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-semibold">{t('landing.friendTitle')}</span>
                    <span className="text-xs text-dim max-sm:hidden">{t('header.login')}</span>
                  </span>
                </Link>
              )}
            </div>

            {isPlus ? (
              <button
                type="button"
                disabled={!agreed}
                onClick={() => begin('video', 'online')}
                className="flex items-center gap-3 rounded-[14px] border border-[#3a3418] bg-[#1b1a10] px-4 py-3.5 text-left text-gold transition hover:border-[#4a4220] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CrownIcon />
                <span className="flex-1 text-sm font-semibold">{t('landing.online')}</span>
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            ) : (
              <Link
                href="/plus"
                className="flex items-center gap-3 rounded-[14px] border border-[#3a3418] bg-[#1b1a10] px-4 py-3.5 text-gold transition hover:border-[#4a4220]"
              >
                <CrownIcon />
                <span className="flex-1 text-sm font-semibold">{t('landing.online')}</span>
                <span className="text-xs text-[#c9b25a]">Plus</span>
                <ChevronRightIcon className="h-4 w-4" />
              </Link>
            )}
          </form>
        </section>

        {/* Features and streak */}
        <section className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-2">
          <ul className="m-0 grid max-w-[540px] list-none gap-3 p-0 sm:grid-cols-3">
            {(
              [
                [<CameraIcon key="1" className="h-5 w-5" color="#c6f432" />, t('landing.feat1')],
                [<ShieldIcon key="2" className="h-5 w-5" color="#c6f432" />, t('landing.feat2')],
                [<EyeOffIcon key="3" className="h-5 w-5" color="#c6f432" />, t('landing.feat3')],
              ] as const
            ).map(([icon, text]) => (
              <li key={text} className="flex items-center gap-2.5 rounded-[14px] sm:flex-col sm:items-start sm:border sm:border-line sm:bg-card sm:p-4">
                {icon}
                <span className="text-sm leading-snug text-[#d6dae3]">{text}</span>
              </li>
            ))}
          </ul>

          {user && <DailyRewardCard className="max-w-[540px]" />}
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}
