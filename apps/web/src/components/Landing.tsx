'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MAX_NAME, MAX_PROFILE_AGE, MIN_PROFILE_AGE, NO_FILTERS, type ChatMode, type Gender, type JoinPayload, type MatchFilters, type PlanPrice } from '@rc/shared';
import { api, useAuth } from '@/lib/auth';
import { loadSettings, onSettingsChange } from '@/lib/settings';
import { LANGS, useI18n, type Lang } from '@/lib/i18n';
import { AgeHoldNotice } from './AgeGate';
import { HOME_FAQ } from '@/lib/seo';
import { COUNTRY_PAGES } from '@/lib/countryPages';
import { PlusModal } from './PlusModal';
import { useInstall } from './Pwa';
import { AccountMenu } from './SiteHeader';
import { CameraIcon } from './UiIcons';

interface Props {
  online: number | null;
  onStart: (join: Omit<JoinPayload, 'mode' | 'hideCountry'>, mode: ChatMode, browse?: false | 'online' | 'friends') => void;
}

const AGREED_KEY = 'rc.agreed18';

/* ---------- The wall of sample profiles (one illustration, many crops) ---------- */

/** Kept for the log-in page's tiles. */
export const TILE_COLORS = [
  ['linear-gradient(165deg,#8a5fc2,#3b2a4f)', '#2a1b3d'],
  ['linear-gradient(165deg,#3fa08a,#1f3b36)', '#0f2b26'],
  ['linear-gradient(165deg,#e08a4f,#4a2a1c)', '#2e180e'],
  ['linear-gradient(165deg,#5878d8,#1e2a4f)', '#121a36'],
  ['linear-gradient(165deg,#d06483,#3f1f2b)', '#3a0f22'],
  ['linear-gradient(165deg,#c9a12e,#4f3e0c)', '#4f3e0c'],
] as const;
export const SKINS = ['#f1c7a5', '#c68b5e', '#f3d2b8', '#e8b48a', '#8d5a3b'];

/** Optional extra photos: public/faces/index.json (["a.webp", ...]). The sample illustration is used otherwise. */
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

const NAMES = ['Aanya', 'Sofia', 'Yuki', 'Lucía', 'Amara', 'Chloe', 'Elif', 'Valeria', 'Mia', 'Zara', 'Nora', 'Isabella', 'Leila', 'Hana', 'Ana', 'Emma', 'Priya', 'Camila', 'Aiko', 'Fatima', 'Olivia', 'Sara', 'Ines', 'Maya', 'Lina', 'Ava', 'Rosa', 'Ji-woo', 'Nadia', 'Kiara', 'Mei', 'Laura', 'Ayesha', 'Bianca', 'Elena', 'Sakura', 'Dina', 'Julia', 'Noor', 'Alba', 'Riya', 'Tara', 'Lea', 'Selin', 'Marta', 'Ivy', 'Paula', 'Yara', 'Sana', 'Gabriela', 'Ece', 'Asha', 'Clara', 'Luna', 'Nia', 'Rina', 'Diya', 'Eva', 'Mira', 'Anya'];
const PLACES = ['India', 'Brazil', 'Japan', 'Spain', 'Kenya', 'Canada', 'Turkey', 'Mexico', 'Italy', 'France', 'Korea', 'Egypt', 'Peru', 'Germany', 'Philippines', 'UAE', 'Vietnam', 'Colombia'];
const POS = ['center 22%', 'center 14%', '38% 20%', '62% 24%', 'center 30%', '50% 8%'];
const SIZE = ['cover', '140%', '175%', 'cover', '210%', '125%'];
const FILTER = ['none', 'saturate(1.15) contrast(1.05)', 'sepia(.22) saturate(1.1)', 'hue-rotate(-10deg) saturate(1.1)', 'brightness(1.06) contrast(1.08)', 'saturate(.85) brightness(.96)', 'hue-rotate(12deg)'];

/** Scrolling columns of sample profiles, each column drifting the other way. */
export function SampleWall({ cols, tileH, compact = false }: { cols: number; tileH: number; compact?: boolean }) {
  const faces = useFaces();
  const make = (i: number) => {
    const [bg] = TILE_COLORS[i % TILE_COLORS.length]!;
    const photo = faces.length ? faces[i % faces.length]! : '/sample-profile.jpg';
    return {
      bg,
      photo,
      // One illustration gets varied crops and tints; a set of real photos is shown as is.
      ph: faces.length
        ? { backgroundPosition: 'center 30%', backgroundSize: 'cover', animationDelay: `-${i % 12}s` }
        : { backgroundPosition: POS[i % 6], backgroundSize: SIZE[(i * 5) % 6], filter: FILTER[(i * 3) % 7], animationDelay: `-${i % 12}s` },
      mirror: !faces.length && i % 2 === 1,
      label: `${NAMES[i % NAMES.length]}, ${20 + ((i * 7) % 21)} · ${PLACES[(i * 5) % PLACES.length]}`,
    };
  };
  // Enough tiles per column that every photo appears once.
  const perCol = Math.max(14, Math.ceil(faces.length / cols));
  const columns = Array.from({ length: cols }, (_, c) => Array.from({ length: perCol }, (_, k) => make(c * perCol + k)));
  return (
    <div aria-hidden className={`absolute inset-0 grid ${compact ? 'gap-2 px-2' : 'gap-3'}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {columns.map((tiles, c) => (
        <div key={c} className={`flex flex-col ${compact ? 'gap-2' : 'gap-3'} ${c % 2 ? 'rc-wall-down' : 'rc-wall-up'}`}>
          {[...tiles, ...tiles].map((t, k) => (
            <div
              key={k}
              className={`relative shrink-0 overflow-hidden border border-white/[.08] ${compact ? 'rounded-2xl' : 'rounded-[20px]'}`}
              style={{ height: tileH, background: t.bg }}
            >
              <div className="absolute inset-0" style={t.mirror ? { transform: 'scaleX(-1)' } : undefined}>
                <div className="rc-kb absolute inset-0 bg-no-repeat" style={{ ...t.ph, backgroundImage: `url(${t.photo})` }} />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.25)_0%,transparent_25%,transparent_70%,rgba(0,0,0,.35))]" />
              </div>
              <span
                className={`absolute left-2 top-2 max-w-[calc(100%-16px)] overflow-hidden whitespace-nowrap rounded-full bg-black/50 font-semibold text-white ${compact ? 'px-[7px] py-[3px] text-[10px]' : 'px-2.5 py-[5px] text-xs'}`}
              >
                {t.label}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------- Header bits ---------- */

const LANG_SHORT: Record<Lang, string> = { en: 'EN', hi: 'HI', es: 'ES', pt: 'PT', fr: 'FR', id: 'ID' };

function LanguageMenu({ open, onToggle, onClose }: { open: boolean; onToggle: () => void; onClose: () => void }) {
  const { lang, setLang } = useI18n();
  const name = LANGS.find((l) => l.code === lang)?.name ?? 'English';
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Language"
        aria-expanded={open}
        onClick={onToggle}
        className="flex h-11 items-center gap-2 rounded-xl border border-[#6b5d84] px-3 text-sm font-medium text-[#e6e8ec] max-sm:bg-card max-sm:font-semibold"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
        </svg>
        <span className="max-sm:hidden">{name}</span>
        <span className="sm:hidden">{LANG_SHORT[lang]}</span>
        <svg viewBox="0 0 24 24" className="h-3 w-3 max-sm:hidden" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={onClose} aria-hidden />
          <ul
            role="listbox"
            aria-label="Language"
            className="absolute right-0 top-[52px] z-40 m-0 w-[200px] list-none rounded-[14px] border border-divider bg-card p-1.5 shadow-[0_20px_50px_rgba(0,0,0,.5)]"
          >
            {LANGS.map((l) => (
              <li key={l.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={l.code === lang}
                  onClick={() => {
                    setLang(l.code);
                    onClose();
                  }}
                  className={`h-11 w-full rounded-[10px] px-3 text-left text-sm font-medium ${l.code === lang ? 'bg-pick text-lime' : 'text-[#e6e8ec] hover:bg-card-2'}`}
                >
                  {l.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** "Install app" with a small explainer (desktop popover, phone sheet). Hidden once installed or when the browser can't. */
function InstallPopover({ open, onToggle, onClose }: { open: boolean; onToggle: () => void; onClose: () => void }) {
  const { state, install } = useInstall();
  if (state === 'hidden') return null;
  return (
    <div className="relative max-sm:hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex h-11 items-center gap-2 rounded-xl bg-pick px-3.5 text-sm font-semibold text-lime"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
          <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
        </svg>
        Install app
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Install randomCall"
          className="absolute right-0 top-[52px] z-40 flex w-80 flex-col gap-3 rounded-[18px] border border-divider bg-card p-[18px] shadow-[0_20px_50px_rgba(0,0,0,.5)]"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-lime">
              <CameraIcon className="h-5 w-5" color="#0b0d10" strokeWidth={2.4} />
            </span>
            <div>
              <strong className="font-display text-base">Install randomCall</strong>
              <p className="m-0 mt-0.5 text-xs text-mute">{typeof window === 'undefined' ? '' : window.location.host}</p>
            </div>
          </div>
          <ul className="m-0 pl-[18px] text-[13px] leading-relaxed text-[#c9cdd4]">
            <li>Opens in one click from your dock or desktop</li>
            <li>Faster start, own window, no tabs</li>
            <li>Message alerts when someone writes</li>
          </ul>
          {state === 'ios' && <p className="m-0 text-[13px] text-mute">In Safari, tap Share ⬆ then “Add to Home Screen”.</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-[#6b5d84] text-sm font-semibold text-[#e6e8ec]">
              Not now
            </button>
            {state === 'prompt' && (
              <button
                type="button"
                onClick={() => {
                  void install();
                  onClose();
                }}
                className="h-11 flex-1 rounded-xl bg-lime font-display text-[15px] font-bold text-night"
              >
                Install
              </button>
            )}
          </div>
          <p className="m-0 text-[11px] text-[#8a8f99]">Free · no app store</p>
        </div>
      )}
    </div>
  );
}

/** Phones: "Get the app" banner over the tiles, with a how-to sheet. */
function InstallBanner() {
  const { state, install } = useInstall();
  const [dismissed, setDismissed] = useState(false);
  const [sheet, setSheet] = useState(false);
  if (state === 'hidden' || dismissed) return null;
  return (
    <>
      <div className="absolute inset-x-4 top-3 z-10 flex items-center gap-2.5 rounded-[14px] border border-divider bg-[rgba(23,18,31,.92)] py-2 pl-2.5 pr-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-lime">
          <CameraIcon className="h-4 w-4" color="#0b0d10" strokeWidth={2.4} />
        </span>
        <span className="min-w-0 flex-1 text-xs leading-tight">
          <strong className="block text-[13px] font-semibold">Get the app</strong>
          <span className="text-mute">Add to home screen · free</span>
        </span>
        <button type="button" onClick={() => setSheet(true)} className="h-11 rounded-[10px] bg-lime px-3 text-[13px] font-bold text-night">
          Install
        </button>
        <button type="button" aria-label="Dismiss" onClick={() => setDismissed(true)} className="h-11 w-11 text-lg text-mute">
          ×
        </button>
      </div>
      {sheet && (
        <div className="fixed inset-0 z-[60]">
          <div aria-hidden className="absolute inset-0 bg-[rgba(11,8,17,.7)]" onClick={() => setSheet(false)} />
          <section role="dialog" aria-label="Install randomCall" className="absolute inset-x-0 bottom-0 flex flex-col gap-3.5 rounded-t-3xl border-t border-divider bg-card px-5 pb-6 pt-2.5">
            <span aria-hidden className="h-1 w-10 self-center rounded-sm bg-line-2" />
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-lime">
                <CameraIcon className="h-5 w-5" color="#0b0d10" strokeWidth={2.4} />
              </span>
              <div>
                <strong className="font-display text-lg">Install randomCall</strong>
                <p className="m-0 mt-0.5 text-xs text-mute">Opens full screen, like a normal app</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 text-[13px] leading-normal">
              <div className="rounded-[14px] bg-card-2 p-3">
                <strong className="block text-sm">Android · Chrome</strong>Tap <strong className="text-lime">Install</strong> below and confirm.
              </div>
              <div className="rounded-[14px] bg-card-2 p-3">
                <strong className="block text-sm">iPhone · Safari</strong>Tap Share <span aria-hidden>⬆</span> in the bottom bar, then <strong className="text-lime">Add to Home Screen</strong>.
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSheet(false)} className="h-[52px] flex-1 rounded-[14px] border border-[#6b5d84] text-[15px] font-semibold text-[#e6e8ec]">
                Not now
              </button>
              <button
                type="button"
                onClick={() => {
                  if (state === 'prompt') void install();
                  setSheet(false);
                }}
                className="h-[52px] flex-[1.4] rounded-[14px] bg-lime font-display text-base font-bold text-night"
              >
                Install
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

/* ---------- Plus filter chips ---------- */

export const GENDER_OPTS: [MatchFilters['gender'], string][] = [
  ['any', 'Any'],
  ['female', 'Women'],
  ['male', 'Men'],
];
export const COUNTRY_OPTS: [string, string][] = [
  ['any', 'Any'],
  ['IN', 'India'],
  ['US', 'USA'],
  ['GB', 'UK'],
  ['BR', 'Brazil'],
  ['JP', 'Japan'],
  ['ES', 'Spain'],
  ['TR', 'Turkey'],
  ['MX', 'Mexico'],
];

function Lock() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="#f2c94c" strokeWidth={2} role="img" aria-label="Plus feature">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function FilterChip<T extends string>({
  label,
  value,
  options,
  locked,
  open,
  onOpen,
  onPick,
}: {
  label: string;
  value: T;
  options: [T, string][];
  locked: boolean;
  open: boolean;
  onOpen: () => void;
  onPick: (v: T) => void;
}) {
  const shown = options.find(([v]) => v === value)?.[1] ?? 'Any';
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-11 items-center gap-2 rounded-xl border border-[#6b5d84] bg-card px-3.5 text-sm font-medium text-[#e6e8ec]"
      >
        {label}: {shown} {locked && <Lock />}
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={label}
          className="absolute bottom-[52px] left-0 z-20 m-0 max-h-72 w-[200px] list-none overflow-y-auto rounded-[14px] border border-divider bg-card p-1.5 shadow-[0_20px_50px_rgba(0,0,0,.5)]"
        >
          {options.map(([v, text]) => (
            <li key={v}>
              <button
                type="button"
                role="option"
                aria-selected={v === value}
                onClick={() => onPick(v)}
                className={`h-11 w-full rounded-[10px] px-3 text-left text-sm font-medium ${v === value ? 'bg-pick text-lime' : 'text-[#e6e8ec] hover:bg-card-2'}`}
              >
                {text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- The page ---------- */

const MODES: [ChatMode, string][] = [
  ['video', 'Video'],
  ['voice', 'Voice'],
  ['text', 'Text'],
];

const ME_OPTS: [Gender, string][] = [
  ['female', 'Woman'],
  ['male', 'Man'],
];

const money = (amount: number, currency: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: amount % 100 ? 2 : 0 }).format(amount / 100);

/** "Check camera & mic": asks the browser once, then shows it's ready. */
function CamCheck({ mode, className = '' }: { mode: ChatMode; className?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'denied'>('idle');
  const voice = mode === 'voice';
  const test = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia(voice ? { audio: true } : { audio: true, video: true });
      s.getTracks().forEach((t) => t.stop());
      setState('ok');
    } catch {
      setState('denied');
    }
  };
  const ok = state === 'ok';
  const title = ok ? (voice ? 'Mic ready ✓' : 'Camera & mic ready ✓') : voice ? 'Check your mic' : 'Check camera & mic';
  const sub = ok ? (voice ? 'Sound level looks good' : 'You look good · tap to test again') : state === 'denied' ? 'Blocked — allow it in your browser settings' : 'Your browser asks once';
  return (
    <button
      type="button"
      onClick={() => void test()}
      aria-label={title}
      className={`flex h-[52px] w-full items-center gap-2.5 rounded-[14px] border bg-card px-1.5 text-left ${ok ? 'border-[#2e5a3c]' : 'border-[#6b5d84]'} ${className}`}
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-[#e6e8ec] ${ok && !voice ? 'bg-[radial-gradient(circle_at_50%_42%,#c68b5e_0_22%,transparent_23%),radial-gradient(ellipse_60%_36%_at_50%_100%,#2a3550_0_98%,transparent_100%),linear-gradient(165deg,#3a4a6e,#1a2033)]' : 'bg-card-2'}`}
      >
        {!(ok && !voice) && (
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            {voice ? (
              <>
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
              </>
            ) : (
              <>
                <rect x="2" y="6" width="14" height="12" rx="2" />
                <path d="M16 10l6-3v10l-6-3" />
              </>
            )}
          </svg>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <b className="text-sm font-semibold text-[#f4f5f7]">{title}</b>
        <span className="truncate text-xs text-mute">{sub}</span>
      </span>
      {!ok && <span className="px-2 text-[13px] font-semibold text-lime">Test</span>}
    </button>
  );
}

const TABS: [string, string][] = [
  ['/', 'Chat'],
  ['/messages', 'People'],
  ['/coins', 'Coins'],
  ['/settings', 'Me'],
];

export function Landing({ online, onStart }: Props) {
  const { saveSettings, user } = useAuth();
  const isPlus = !!user?.plus.active;
  const [gender, setGender] = useState<Gender | null>(null);
  const [name, setName] = useState('');
  const [ageText, setAgeText] = useState('');
  const [mode, setMode] = useState<ChatMode>('video');
  const [filters, setFilters] = useState<MatchFilters>(NO_FILTERS);
  const [menu, setMenu] = useState<'lang' | 'install' | 'g' | 'c' | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [plusPrice, setPlusPrice] = useState<string | null>(null);
  // The 18+ box is remembered, so coming back is one click.
  const [agreed, setAgreedState] = useState(false);
  // A complete saved profile shows as a "returning" card with Edit.
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    try {
      setAgreedState(window.localStorage.getItem(AGREED_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);
  const setAgreed = (v: boolean) => {
    setAgreedState(v);
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
      setGender(s.gender === 'male' || s.gender === 'female' ? s.gender : null);
      setName(s.name ?? '');
      setAgeText(s.age ? String(s.age) : '');
      setFilters(s.filters ?? NO_FILTERS);
      setSaved(!!(s.name?.trim() && s.age && (s.gender === 'male' || s.gender === 'female')));
    };
    apply();
    return onSettingsChange(apply);
  }, []);

  // Monthly Plus price for the "Get Plus" button (real Stripe price).
  useEffect(() => {
    if (isPlus) return;
    api<{ enabled: boolean; plans: PlanPrice[] }>('/billing/plans')
      .then((r) => {
        const m = r.enabled ? r.plans.find((p) => p.plan === 'month') : undefined;
        setPlusPrice(m ? `${money(m.amount, m.currency)}/mo` : null);
      })
      .catch(() => setPlusPrice(null));
  }, [isPlus]);

  const ageNum = Number(ageText);
  const age = Number.isInteger(ageNum) && ageNum >= MIN_PROFILE_AGE && ageNum <= MAX_PROFILE_AGE ? ageNum : null;
  const returning = saved && agreed && !editing;
  const nameOk = name.trim().length > 0;
  const ok = nameOk && age !== null && !!gender && agreed;
  const hint = !nameOk
    ? 'Add your name to start'
    : age === null
      ? `Enter your age (${MIN_PROFILE_AGE}+) to start`
      : !gender
        ? 'Choose Woman or Man to start'
        : 'Tick “I agree to the Terms” to start';
  const meLabel = ME_OPTS.find(([g]) => g === gender)?.[1] ?? '';

  const begin = (m: ChatMode, browse: false | 'online' | 'friends' = false) => {
    // Name, age and gender are shown to the people you meet, so all are required.
    if (!ok || !gender || age === null) return;
    // Remember the choices for next time; don't block the chat on the network.
    void saveSettings({ ...loadSettings(), gender, interests: [], name: name.trim(), age, filters }).catch(() => undefined);
    onStart({ gender, interests: [], topic: null }, m, browse);
  };

  const pickFilter = (patch: Partial<MatchFilters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    setMenu(null);
    void saveSettings({ ...loadSettings(), filters: next }).catch(() => undefined);
  };
  const chipOpen = (which: 'g' | 'c') => (isPlus ? setMenu(menu === which ? null : which) : setPlusOpen(true));
  const modeLabel = MODES.find(([m]) => m === mode)![1].toLowerCase();
  const needsCam = mode !== 'text';

  const field =
    'h-12 w-full rounded-xl border border-[#6b5d84] bg-card px-3.5 text-base font-medium text-[#f4f5f7] placeholder:text-[#6b6478] focus:outline-2 focus:outline-offset-1 focus:outline-lime aria-[invalid=true]:border-stop-text max-sm:px-3';
  const termsLink = '-my-3.5 inline-block px-0.5 py-3.5 text-lime';

  return (
    <main
      className={`relative flex min-h-dvh flex-col bg-night text-[#f4f5f7] sm:bg-[radial-gradient(ellipse_60%_70%_at_78%_45%,#1e0f2a_0%,#0b0811_60%)] ${user ? 'max-sm:pb-[76px]' : ''}`}
    >
      {/* Header */}
      <header className="flex h-[60px] shrink-0 items-center justify-between gap-4 border-b border-[#1a1422] px-4 sm:h-auto sm:flex-wrap sm:border-0 sm:px-12 sm:py-4">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold sm:gap-2.5 sm:text-xl" aria-label="randomCall home">
          <span className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-lime sm:h-[34px] sm:w-[34px] sm:rounded-[10px]">
            <CameraIcon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" color="#0b0d10" strokeWidth={2.4} />
          </span>
          randomCall
        </Link>
        <nav className="relative z-[5] flex items-center gap-2 text-sm sm:gap-3">
          <InstallPopover open={menu === 'install'} onToggle={() => setMenu(menu === 'install' ? null : 'install')} onClose={() => setMenu(null)} />
          <LanguageMenu open={menu === 'lang'} onToggle={() => setMenu(menu === 'lang' ? null : 'lang')} onClose={() => setMenu(null)} />
          {online !== null && (
            <span className="flex h-9 items-center gap-2 rounded-full bg-[rgba(255,111,174,.08)] px-3 text-mute max-sm:hidden">
              <i className="rc-blink h-2 w-2 rounded-full bg-lime" aria-hidden />
              {Math.max(online, 1).toLocaleString()} online
            </span>
          )}
          {user ? (
            <AccountMenu />
          ) : (
            <Link
              href="/login"
              className="flex h-11 items-center rounded-xl border border-[#6b5d84] px-[18px] text-[#e6e8ec] max-sm:border-0 max-sm:bg-[#f4f5f7] max-sm:px-4 max-sm:font-bold max-sm:text-night"
            >
              Log in
            </Link>
          )}
        </nav>
      </header>

      <div className="mx-auto flex w-full max-w-[1360px] flex-1 flex-col gap-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-14 sm:px-12 sm:pb-4 sm:pt-2">
        {/* Phones: the sample wall comes first, under the header. */}
        <div aria-label="Sample profiles" className={`relative shrink-0 overflow-hidden sm:hidden ${user ? 'h-[156px]' : returning ? 'h-[240px]' : 'h-[176px]'}`}>
          <SampleWall cols={3} tileH={170} compact />
          <span className="absolute bottom-2 right-2.5 z-[2] flex h-6 items-center rounded-full bg-[rgba(11,8,17,.75)] px-2.5 text-[11px] font-medium text-[#c9cdd4]">
            Sample profiles · illustration
          </span>
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-[120px] bg-[linear-gradient(180deg,rgba(11,8,17,0),#0b0811)]" />
          <InstallBanner />
        </div>

        <section className={`flex flex-1 flex-col gap-3.5 px-5 pt-1 sm:max-w-[480px] sm:flex-[1_1_440px] sm:gap-4 sm:p-0 ${user ? 'pb-4' : 'pb-6'}`}>
          {online !== null && (
            <span className="flex items-center gap-1.5 text-[13px] text-mute sm:hidden">
              <i className="rc-blink h-[7px] w-[7px] rounded-full bg-lime" aria-hidden />
              {Math.max(online, 1).toLocaleString()} online now
            </span>
          )}
          <h1 className="m-0 font-display text-[34px] font-bold leading-[1.05] tracking-[-1px] sm:text-[52px] sm:leading-[1.02] sm:tracking-[-1.5px]">
            Meet someone new <span className="text-lime">in 3 seconds.</span>
          </h1>
          <p className="m-0 text-base leading-snug text-mute max-sm:hidden">Free video chat in your browser. People you meet see your name, age, gender and country.</p>
          <p className="-mt-2 mb-0 text-xs text-mute sm:hidden">People you meet see your name, age, gender and country.</p>

          <AgeHoldNotice />
          {user && friendOnline && <p className="m-0 text-sm font-medium text-lime">A friend is online — open Friends in the call to ring them.</p>}

          {returning ? (
            <div className="flex items-center gap-3 rounded-[14px] border border-divider bg-card py-2 pl-3 pr-2">
              <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-lime font-display text-[17px] font-bold text-night">
                {(name.trim().charAt(0) || '?').toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-[15px] font-semibold">
                  {name.trim()}, {ageText} · {meLabel}
                </strong>
                <span className="text-xs text-mute">{user ? 'From your profile' : 'Saved on this device'}</span>
              </span>
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label="Edit your name, age and gender"
                className="h-11 rounded-[10px] border border-[#6b5d84] px-3.5 text-[13px] font-semibold text-[#e6e8ec]"
              >
                Edit
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
                <label className="flex flex-col gap-1 text-xs text-mute sm:gap-1.5 sm:text-[13px]">
                  Your name
                  <input id="home-name" required value={name} maxLength={MAX_NAME} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" autoComplete="given-name" className={field} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-mute sm:gap-1.5 sm:text-[13px]">
                  Age
                  <input
                    id="home-age"
                    required
                    aria-invalid={!!ageText && age === null}
                    type="number"
                    min={MIN_PROFILE_AGE}
                    max={MAX_PROFILE_AGE}
                    inputMode="numeric"
                    placeholder="18+"
                    value={ageText}
                    onChange={(e) => setAgeText(e.target.value.slice(0, 2))}
                    className={field}
                  />
                </label>
              </div>
              {!!ageText && age === null && ageText.length >= 2 && (
                <p role="alert" className="m-0 mt-1 text-xs text-stop-text">
                  You must be {MIN_PROFILE_AGE} or older to use randomCall.
                </p>
              )}
              <div role="radiogroup" aria-label="I am" className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-[13px] text-mute sm:w-12">I am</span>
                {ME_OPTS.map(([g, label]) => (
                  <button
                    key={g}
                    type="button"
                    role="radio"
                    aria-checked={g === gender}
                    onClick={() => setGender(g)}
                    className={`h-11 flex-1 rounded-full px-2.5 text-sm font-semibold ${g === gender ? 'border-[1.5px] border-lime bg-pick text-[#f4f5f7]' : 'border border-[#6b5d84] bg-card text-[#e6e8ec]'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div role="radiogroup" aria-label="Chat type" className="grid grid-cols-3 gap-1 rounded-[14px] border border-divider bg-card p-1">
            {MODES.map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={m === mode}
                onClick={() => setMode(m)}
                className={`h-11 rounded-[10px] text-sm font-semibold sm:text-[15px] ${m === mode ? 'bg-pick text-[#f4f5f7] shadow-[inset_0_0_0_1.5px_#ff6fae]' : 'text-mute hover:text-[#e6e8ec]'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {user && (
            <Link
              href="/coins"
              className="flex items-center gap-2.5 rounded-[14px] border border-[#4a3f17] bg-gold-bg px-3.5 py-2.5 text-sm font-semibold text-gold sm:px-4 sm:py-3"
            >
              <span aria-hidden>🔥</span>
              <span className="flex-1">
                <b>Daily streak</b> · chat today to keep it going
              </span>
              ›
            </Link>
          )}

          {/* Phones: camera check sits at the bottom, above the terms box. */}
          {needsCam ? <CamCheck mode={mode} className="mt-auto sm:hidden" /> : <div className="mt-auto sm:hidden" />}

          {!returning && (
            <label className="flex min-h-11 items-center gap-2 text-xs text-mute sm:gap-2.5 sm:text-[13px]">
              <input id="agree18" type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="m-0 h-[18px] w-[18px] shrink-0 accent-lime" />
              <span>
                I agree to the{' '}
                <Link href="/terms" target="_blank" className={termsLink}>
                  Terms
                </Link>{' '}
                &amp;{' '}
                <Link href="/guidelines" target="_blank" className={termsLink}>
                  Guidelines
                </Link>
              </span>
            </label>
          )}

          {needsCam && <CamCheck mode={mode} className="max-sm:hidden" />}

          <button
            type="button"
            onClick={() => begin(mode)}
            disabled={!ok}
            aria-describedby={ok ? undefined : 'start-hint'}
            className="flex h-[58px] w-full items-center justify-center gap-2 rounded-2xl bg-lime font-display text-[19px] font-bold text-night shadow-[0_12px_40px_rgba(255,111,174,.25)] disabled:cursor-not-allowed disabled:bg-none disabled:bg-[#271f33] disabled:text-[#8a8f99] sm:gap-2.5 sm:text-xl"
          >
            Start {modeLabel} chat
            {ok && (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            )}
          </button>
          {!ok && (
            <p id="start-hint" role="status" className="-mt-1.5 mb-0 text-center text-[13px] text-[#ffb3c9]">
              {hint}
            </p>
          )}

          <div className="flex flex-wrap gap-2 max-sm:hidden">
            <FilterChip
              label="Gender"
              value={filters.gender}
              options={GENDER_OPTS}
              locked={!isPlus}
              open={menu === 'g'}
              onOpen={() => chipOpen('g')}
              onPick={(v) => pickFilter({ gender: v })}
            />
            <FilterChip
              label="Country"
              value={filters.country}
              options={COUNTRY_OPTS}
              locked={!isPlus}
              open={menu === 'c'}
              onOpen={() => chipOpen('c')}
              onPick={(v) => pickFilter({ country: v })}
            />
            {isPlus ? (
              <span className="flex h-11 items-center rounded-xl bg-gold-bg px-3 text-[13px] font-semibold text-gold">Plus member</span>
            ) : (
              <button
                type="button"
                onClick={() => setPlusOpen(true)}
                className="flex h-11 items-center rounded-xl border border-[#4a3f17] bg-gold-bg px-3.5 text-sm font-semibold text-gold"
              >
                Get Plus{plusPrice ? ` · ${plusPrice}` : ''}
              </button>
            )}
          </div>

          <p className="-mb-3 -mt-2.5 text-center text-xs sm:hidden">
            <Link href="/help" className="inline-flex min-h-11 items-center px-2.5 text-mute">
              Help
            </Link>
            ·
            <Link href="/privacy" className="inline-flex min-h-11 items-center px-2.5 text-mute">
              Privacy
            </Link>
            ·
            <Link href="/guidelines" className="inline-flex min-h-11 items-center px-2.5 text-mute">
              Guidelines
            </Link>
          </p>
        </section>

        {/* Larger screens: the sample wall on the right. */}
        <section
          aria-label="Sample profiles"
          className="relative h-[640px] overflow-hidden [mask-image:linear-gradient(180deg,transparent,#000_10%,#000_90%,transparent)] max-sm:hidden sm:flex-[1_1_560px]"
        >
          <SampleWall cols={4} tileH={230} />
          <span className="absolute bottom-3.5 right-2.5 z-[2] flex h-6 items-center rounded-full bg-[rgba(11,8,17,.75)] px-2.5 text-[11px] font-medium text-[#c9cdd4]">
            Sample profiles · illustration
          </span>
        </section>
      </div>

      {/* About + FAQ: plain text people (and search engines) can read, below the first screen. */}
      <section aria-labelledby="about-h" className="mx-auto w-full max-w-[1100px] px-5 pb-16 pt-10 sm:px-12">
        <h2 id="about-h" className="m-0 font-display text-[26px] font-bold sm:text-[34px]">
          Free random video chat with strangers
        </h2>
        <p className="mb-0 mt-3 max-w-[760px] text-[15px] leading-relaxed text-mute">
          randomCall connects you with a random person for a one-on-one video chat in about 3 seconds — no download, no sign-up. Press Next to
          meet someone new, switch to voice or text chat, add a face mask, send gifts and follow the people you click with. It&apos;s a simple,
          safer Omegle and Chatroulette alternative that works in your browser on phone and computer.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {HOME_FAQ.map(([q, a]) => (
            <details key={q} className="group rounded-2xl border border-line bg-card p-4">
              <summary className="cursor-pointer list-none font-display text-base font-bold marker:hidden">
                {q}
                <span className="float-right text-lime transition group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mb-0 mt-2 text-sm leading-relaxed text-mute">{a}</p>
            </details>
          ))}
        </div>
        <p className="mb-0 mt-8 text-sm text-mute">
          Chat by country:{' '}
          {COUNTRY_PAGES.slice(0, 12).map((c, i) => (
            <span key={c.slug}>
              {i > 0 && ' · '}
              <Link href={`/chat/${c.slug}`} className="text-lime hover:underline">
                {c.name.replace(/^the /, '')}
              </Link>
            </span>
          ))}
        </p>
      </section>

      <footer className="flex justify-center gap-5 pb-4 text-xs text-[#8a8f99] max-sm:hidden">
        <span>Auto nudity screening</span>
        <span>1‑tap report &amp; block</span>
        <Link href="/privacy" className="text-[#8a8f99] hover:text-white">
          Privacy
        </Link>
        <Link href="/help" className="text-[#8a8f99] hover:text-white">
          Help
        </Link>
      </footer>

      {/* Phones, logged in: the app's bottom tabs. */}
      {user && (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 grid h-[76px] grid-cols-4 border-t border-[#1a1422] bg-[#0e0a13] px-2 pb-3 sm:hidden">
          {TABS.map(([href, label]) => {
            const on = href === '/';
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-1.5 text-xs font-semibold ${on ? 'text-lime' : 'text-[#8a8f99]'}`}
              >
                <span aria-hidden className={`h-[3px] w-5 rounded-sm ${on ? 'bg-lime' : 'bg-transparent'}`} />
                {label}
              </Link>
            );
          })}
        </nav>
      )}

      {plusOpen && <PlusModal onClose={() => setPlusOpen(false)} />}
    </main>
  );
}
