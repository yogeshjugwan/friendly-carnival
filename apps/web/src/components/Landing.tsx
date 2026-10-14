'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AGE_RANGES, ageLabel, MAX_NAME, type AgeRange, type ChatMode, type Gender, type JoinPayload } from '@rc/shared';
import { useAuth } from '@/lib/auth';
import { loadSettings, onSettingsChange } from '@/lib/settings';
import { SiteFooter, SiteHeader } from './SiteHeader';
import { DailyRewardCard } from './DailyReward';
import { AgeHoldNotice } from './AgeGate';
import { useI18n } from '@/lib/i18n';
import { BubbleIcon, CameraIcon, CrownIcon, HeartIcon, MicIcon2, UsersIcon } from './UiIcons';

interface Props {
  online: number | null;
  onStart: (join: Omit<JoinPayload, 'mode' | 'hideCountry'>, mode: ChatMode, browse?: false | 'online' | 'friends') => void;
}

const AGREED_KEY = 'rc.agreed18';

/** Colours for the drifting "live" tiles behind the hero: [tile gradient, silhouette]. */
export const TILE_COLORS = [
  ['linear-gradient(160deg,#ff8a9a,#c2416b)', '#5a1730'],
  ['linear-gradient(160deg,#7fd6c2,#2b8a78)', '#0f3d35'],
  ['linear-gradient(160deg,#ffc37a,#d9733a)', '#5c2a10'],
  ['linear-gradient(160deg,#8fb2ff,#4060c8)', '#17255a'],
  ['linear-gradient(160deg,#d7a6ff,#8a4fd1)', '#3a1a60'],
  ['linear-gradient(160deg,#f7e07a,#c9a12e)', '#4f3e0c'],
] as const;
const PLACES = ['India', 'Brazil', 'Japan', 'Spain', 'Kenya', 'Canada', 'Turkey', 'Mexico'];
export const SKINS = ['#f1c7a5', '#c68b5e', '#8d5a3b', '#e8b48a', '#5e3a26'];
const HAIRS = ['#1b1210', '#4a2c18', '#2a1a12', '#7a4a20', '#111111'];

/**
 * Photos for the tile wall: list them in public/faces/index.json (["face-1.webp", ...]).
 * Without it the wall shows animated cartoon people.
 */
export function useFaces() {
  const [faces, setFaces] = useState<string[]>([]);
  useEffect(() => {
    fetch('/faces/index.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: unknown) => setFaces(Array.isArray(list) ? list.filter((f): f is string => typeof f === 'string').map((f) => `/faces/${f}`) : []))
      .catch(() => setFaces([]));
  }, []);
  return faces;
}

/** The wall of people behind the Start button: 6 columns (3 on phones), alternately drifting up and down. */
function TileWall() {
  const faces = useFaces();
  const cols = [0, 1, 2, 3, 4, 5].map((i) =>
    Array.from({ length: 8 }, (_, k) => {
      const [bg, fg] = TILE_COLORS[(i + k) % 6]!;
      return {
        bg,
        fg,
        skin: SKINS[(i + k * 2) % 5]!,
        hair: HAIRS[(i * 2 + k) % 5]!,
        place: PLACES[(i * 3 + k) % 8]!,
        // Out of step, so the wall doesn't move as one.
        delay: `-${((i * 7 + k * 3) % 10) / 3}s`,
        face: faces.length ? faces[(i * 5 + k * 7) % faces.length] : null,
      };
    }),
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -inset-10 grid grid-cols-3 gap-2.5 px-2.5 opacity-95 sm:grid-cols-6 sm:gap-4 sm:px-4 sm:[transform:rotate(-6deg)_scale(1.15)]">
        {cols.map((tiles, i) => (
          // Each column holds its tiles twice so the drift loops seamlessly.
          <div key={i} className={`flex flex-col gap-2.5 sm:gap-4 ${i % 2 ? 'rc-drift-up' : 'rc-drift'} ${i > 2 ? 'max-sm:hidden' : ''}`}>
            {[...tiles, ...tiles].map((t, k) => (
              <div key={k} className="relative h-[170px] shrink-0 overflow-hidden rounded-2xl sm:h-[240px] sm:rounded-[20px]" style={{ background: t.bg }}>
                {t.face ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.face} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  // A cartoon person chatting: head sways, mouth talks, eyes blink, hand waves.
                  <svg viewBox="0 0 100 80" preserveAspectRatio="xMidYMax meet" className="absolute inset-x-0 bottom-0 h-4/5 w-full">
                    <path d="M12 80c4-22 18-32 38-32s34 10 38 32z" fill={t.fg} />
                    <g className="rc-sway" style={{ animationDelay: t.delay }}>
                      <circle cx="50" cy="30" r="15" fill={t.skin} />
                      <path d="M35 28c0-12 7-17 15-17s15 5 15 17c-3-6-8-8-15-8s-12 2-15 8z" fill={t.hair} />
                      <g className="rc-eyes" style={{ animationDelay: t.delay }}>
                        <circle cx="44" cy="30" r="1.6" fill="#1a1a1a" />
                        <circle cx="56" cy="30" r="1.6" fill="#1a1a1a" />
                      </g>
                      <ellipse className="rc-talk" style={{ animationDelay: t.delay }} cx="50" cy="38" rx="4" ry="2" fill="#7a2a2a" />
                    </g>
                    <path className="rc-wave" style={{ animationDelay: t.delay }} d="M78 60l6-22" stroke={t.skin} strokeWidth="6" strokeLinecap="round" />
                  </svg>
                )}
                <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_60%,rgba(0,0,0,.35))]" />
                <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2 py-1 text-[11px] font-semibold text-night max-sm:hidden">
                  <i className="rc-blink h-1.5 w-1.5 rounded-full bg-lime" />
                  {t.place}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* Darken the middle (desktop) or the bottom (phones) so the text stays readable. */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,8,11,.4)_0%,rgba(7,8,11,.75)_40%,#07080b_72%)] sm:bg-[radial-gradient(ellipse_55%_70%_at_50%_52%,rgba(7,8,11,.9)_25%,rgba(7,8,11,.15)_100%)]" />
    </div>
  );
}

/** Gender, name, interests and topic: optional, remembered, tucked behind "Preferences". */
function PreferencesSheet({
  onClose,
  gender,
  setGender,
  name,
  setName,
  age,
  setAge,
}: {
  onClose: () => void;
  gender: Gender;
  setGender: (g: Gender) => void;
  name: string;
  setName: (v: string) => void;
  age: AgeRange | null;
  setAge: (a: AgeRange | null) => void;
}) {
  const { t } = useI18n();
  const genders: [Gender, string][] = [
    ['male', t('gender.male')],
    ['female', t('gender.female')],
    ['couple', t('gender.coupleShort')],
  ];
  const label = 'flex flex-col gap-2 text-[13px] font-medium text-mute';
  const field =
    'h-[46px] w-full rounded-xl border border-line-2 bg-night px-3.5 text-[15px] text-[#e8ebf2] placeholder:text-[#6b7385] focus:outline-2 focus:outline-offset-1 focus:outline-lime';
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="prefs-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90dvh] w-full max-w-md flex-col gap-5 overflow-y-auto rounded-t-3xl border border-line-2 bg-card p-6 text-left sm:rounded-3xl"
      >
        <div className="flex items-center justify-between">
          <h2 id="prefs-title" className="m-0 font-display text-xl font-bold">
            {t('hero.prefs')}
          </h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-2xl leading-none text-dim hover:text-night">
            ×
          </button>
        </div>
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
                className={`h-11 rounded-[10px] text-[15px] font-semibold transition ${gender === value ? 'bg-lime text-night' : 'text-mute hover:text-[#e8ebf2]'}`}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
        <label className={label} htmlFor="name">
          <span>
            {t('landing.name')} <span className="font-normal text-[#6b7385]">· {t('landing.optional').replace(/[()]/g, '')}</span>
          </span>
          <input id="name" value={name} maxLength={MAX_NAME} onChange={(e) => setName(e.target.value)} placeholder={t('landing.namePlaceholder')} autoComplete="nickname" className={field} />
        </label>
        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] font-medium text-mute" id="age-label">
            Age <span className="font-normal text-[#6b7385]">· a range, never your exact age</span>
          </span>
          <div role="radiogroup" aria-labelledby="age-label" className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-night p-1">
            {AGE_RANGES.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={age === a}
                onClick={() => setAge(age === a ? null : a)}
                className={`h-11 rounded-[10px] text-[15px] font-semibold transition ${age === a ? 'bg-lime text-night' : 'text-mute hover:text-[#e8ebf2]'}`}
              >
                {ageLabel(a)}
              </button>
            ))}
          </div>
        </div>
        <button onClick={onClose} className="h-12 rounded-2xl bg-lime font-display text-base font-bold text-night hover:bg-lime-hover">
          Done
        </button>
      </section>
    </div>
  );
}

export function Landing({ online, onStart }: Props) {
  const { t } = useI18n();
  const { saveSettings, user } = useAuth();
  const isPlus = !!user?.plus.active;
  const [gender, setGender] = useState<Gender>('male');
  const [name, setName] = useState('');
  const [age, setAge] = useState<AgeRange | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  // The 18+ box is remembered, so coming back is one click.
  const [agreed, setAgreedState] = useState(false);
  const [nudge, setNudge] = useState(false);
  useEffect(() => {
    try {
      // Topics and interests were removed from the profile; forget any old choice.
      window.localStorage.removeItem('rc.topic');
      setAgreedState(window.localStorage.getItem(AGREED_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);
  const setAgreed = (v: boolean) => {
    setAgreedState(v);
    if (v) setNudge(false);
    try {
      if (v) window.localStorage.setItem(AGREED_KEY, '1');
      else window.localStorage.removeItem(AGREED_KEY);
    } catch {
      /* ignore */
    }
  };
  // Opened from a "your friend is online" notification.
  const [friendOnline, setFriendOnline] = useState(false);
  useEffect(() => setFriendOnline(new URLSearchParams(window.location.search).has('friends')), []);

  // Prefill from saved settings (the account's, when logged in).
  useEffect(() => {
    const apply = () => {
      const s = loadSettings();
      if (s.gender) setGender(s.gender);
      setName(s.name ?? '');
      setAge(s.age ?? null);
    };
    apply();
    return onSettingsChange(apply);
  }, []);

  const begin = (mode: ChatMode, browse: false | 'online' | 'friends' = false) => {
    if (!agreed) {
      setNudge(true);
      document.getElementById('agree18')?.focus();
      return;
    }
    // Remember the choices for next time; don't block the chat on the network.
    void saveSettings({ ...loadSettings(), gender, interests: [], name: name.trim(), age }).catch(() => undefined);
    onStart({ gender, interests: [], topic: null }, mode, browse);
  };

  const alt =
    'flex h-11 items-center justify-center gap-2 rounded-xl border border-line-2 bg-card-2/80 px-4 text-sm font-medium text-[#e6e8ec] backdrop-blur transition hover:border-[#3a3f4a] max-sm:flex-1 max-sm:px-2 max-sm:text-[13px]';

  return (
    <main className="flex min-h-dvh flex-col">
      {/* Hero: fills the first screen, the tile wall behind it. */}
      <section className="relative flex min-h-dvh flex-col overflow-hidden px-4 sm:px-6">
        <TileWall />
        <div className="relative z-10 [&>header]:border-transparent">
          <SiteHeader online={online} home />
        </div>

        <div className="relative z-10 mx-auto flex w-full max-w-[820px] flex-1 flex-col items-center gap-4 pb-8 text-center max-sm:pb-24 max-sm:items-stretch max-sm:justify-end max-sm:text-left sm:gap-7 sm:pt-20">
          <h1 className="m-0 font-display text-[44px] font-bold leading-[1.02] tracking-[-1px] text-[#f4f5f7] sm:text-[76px] sm:leading-none sm:tracking-[-2px]">
            {t('hero.a')}
            <br className="max-sm:hidden" /> <span className="text-lime">{t('hero.b')}</span>
          </h1>
          <p className="m-0 text-[15px] text-mute sm:text-lg">{t('hero.sub')}</p>

          <AgeHoldNotice />
          {user && friendOnline && <p className="m-0 text-sm font-medium text-[#ff7aa8]">{t('landing.friendOnline')}</p>}

          <div className="flex w-full flex-col gap-3.5 sm:mt-2 sm:w-[440px]">
            <button
              type="button"
              onClick={() => begin('video')}
              className={`relative flex h-[60px] items-center justify-center gap-2.5 rounded-2xl bg-lime font-display text-[19px] font-bold text-night transition hover:bg-lime-hover sm:h-16 sm:text-xl ${agreed ? 'rc-ring' : ''}`}
            >
              <CameraIcon className="h-[22px] w-[22px]" strokeWidth={2.2} />
              {t('landing.startVideo')}
            </button>
            <label className={`flex items-center justify-center gap-2 text-xs ${nudge ? 'font-semibold text-[#ffb4a8]' : 'text-dim'}`}>
              <input
                id="agree18"
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className={`m-0 h-4 w-4 shrink-0 accent-lime ${nudge ? 'outline outline-2 outline-offset-2 outline-[#ff8a80]' : ''}`}
              />
              <span>
                {nudge ? `${t('hero.tickFirst')} · ` : ''}
                {t('hero.agree')}{' '}
                <Link href="/terms" target="_blank" className="text-lime hover:text-lime-hover">
                  {t('footer.terms')}
                </Link>{' '}
                &amp;{' '}
                <Link href="/guidelines" target="_blank" className="text-lime hover:text-lime-hover">
                  {t('footer.guidelines')}
                </Link>
              </span>
            </label>
          </div>

          <div className="flex flex-wrap justify-center gap-2 sm:gap-2.5">
            <button type="button" onClick={() => begin('voice')} className={alt}>
              <MicIcon2 className="h-4 w-4" />
              {t('hero.voice')}
            </button>
            <button type="button" onClick={() => begin('text')} className={alt}>
              <BubbleIcon className="h-4 w-4" />
              {t('hero.text')}
            </button>
            <Link href="/rooms" className={alt}>
              <UsersIcon className="h-4 w-4" />
              {t('hero.group')}
            </Link>
            {user && (
              <button type="button" onClick={() => begin('video', 'friends')} className={`${alt} ${friendOnline ? 'border-[#ff7aa8]' : ''}`}>
                <HeartIcon className="h-4 w-4" color="#ff7aa8" />
                {t('hero.friend')}
              </button>
            )}
            {isPlus ? (
              <button type="button" onClick={() => begin('video', 'online')} className={`${alt} border-[#4a3f17] text-gold`}>
                <CrownIcon className="h-4 w-4" />
                {t('landing.online')}
              </button>
            ) : (
              <Link href="/plus" className={`${alt} border-[#4a3f17] text-gold max-sm:basis-full`}>
                <CrownIcon className="h-4 w-4" />
                {t('hero.plus')}
              </Link>
            )}
          </div>

          <button type="button" onClick={() => setPrefsOpen(true)} className="self-center text-[13px] text-mute underline-offset-4 hover:text-white hover:underline">
            ⚙ {t('hero.prefs')}: {t(gender === 'couple' ? 'gender.coupleShort' : `gender.${gender}`)}
            {name.trim() ? ` · ${name.trim()}` : ''}
            {age ? ` · ${ageLabel(age)}` : ''}
          </button>

          <p className="m-0 mt-auto flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-mute [text-shadow:0_1px_3px_rgba(0,0,0,.9)] max-sm:hidden">
            <span>{t('hero.trust1')}</span>
            <span aria-hidden>·</span>
            <span>{t('hero.trust2')}</span>
          </p>
        </div>
      </section>

      {user && (
        <div className="mx-auto w-full max-w-[540px] px-4 py-10">
          <DailyRewardCard />
        </div>
      )}

      <div className="px-4 sm:px-6">
        <SiteFooter />
      </div>

      {prefsOpen && (
        <PreferencesSheet
          onClose={() => setPrefsOpen(false)}
          gender={gender}
          setGender={setGender}
          name={name}
          setName={setName}
          age={age}
          setAge={setAge}
        />
      )}
    </main>
  );
}
