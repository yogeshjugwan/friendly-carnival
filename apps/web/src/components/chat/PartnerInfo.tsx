'use client';

import { useEffect, useState } from 'react';
import { ageLabel, TOPICS } from '@rc/shared';
import { countryName, flagEmoji, GENDER_ICON, GENDER_LABEL } from '@/lib/format';
import { type RandomCall } from '@/lib/useRandomCall';
import { VerifiedBadge } from '../VerifiedBadge';

export function PartnerBadge({ call }: { call: RandomCall }) {
  const { partner } = call;
  if (!partner) return null;
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex max-w-[70vw] items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white sm:max-w-none sm:gap-2 sm:px-3 sm:text-sm">
        {partner.avatar && <span className="text-base sm:text-lg">{partner.avatar}</span>}
        {partner.name && <span className="max-w-[8rem] truncate font-semibold">{partner.name}</span>}
        {partner.age && <span className="text-white/75">{ageLabel(partner.age)}</span>}
        <span title={GENDER_LABEL[partner.gender]}>{GENDER_ICON[partner.gender]}</span>
        <span>{partner.locationHidden ? '📍' : flagEmoji(partner.country)}</span>
        <span className="truncate">{partner.locationHidden ? 'Hidden' : countryName(partner.country)}</span>
        {partner.verified && <VerifiedBadge />}
        {partner.plus && (
          <span title="Plus member" aria-label="Plus member">
            👑
          </span>
        )}
        {partner.isNew && (
          <span title="Joined in the last day" className="rounded-full bg-amber-500/80 px-2 py-0.5 text-[11px] font-semibold text-black">
            New
          </span>
        )}
        {partner.topic && (
          <span className="rounded-full bg-lime/80 px-2 py-0.5 text-[11px] font-semibold text-white">
            {TOPICS.find((t) => t.id === partner.topic)?.emoji} #{TOPICS.find((t) => t.id === partner.topic)?.label}
          </span>
        )}
        {partner.sharedInterests.length > 0 && (
          <span className="hidden truncate text-mute md:inline">· likes {partner.sharedInterests.join(', ')}</span>
        )}
      </div>
      {partner.bio && (
        <p className="max-w-[70vw] truncate rounded-full bg-black/45 px-2.5 py-0.5 text-xs italic text-[#e6e8ec] sm:max-w-sm">“{partner.bio}”</p>
      )}
    </div>
  );
}
/** Who you're talking to, as pills over the top-left of the video: name · country, and the call clock. */
export function PartnerPills({ call }: { call: RandomCall }) {
  const p = call.partner;
  if (!p) return null;
  const where = p.locationHidden ? 'Location hidden' : p.country ? `${flagEmoji(p.country)} ${countryName(p.country)}` : '';
  const topic = p.topic ? TOPICS.find((x) => x.id === p.topic) : null;
  const line = p.sharedInterests.length
    ? `You both like ${p.sharedInterests.join(', ')}`
    : topic
      ? `You're both in ${topic.emoji} ${topic.label}`
      : p.bio
        ? `“${p.bio}”`
        : null;
  const pill = 'flex h-9 items-center gap-1.5 rounded-full bg-black/45 px-3 text-[13px] text-white backdrop-blur';
  return (
    <>
      <span className={`${pill} min-w-0 max-w-full font-semibold`}>
        {p.avatar && <span aria-hidden>{p.avatar}</span>}
        <span className="truncate">
          {p.name || (
            <span title={GENDER_LABEL[p.gender]} aria-label={GENDER_LABEL[p.gender]}>
              {GENDER_ICON[p.gender]} Stranger
            </span>
          )}
          {p.age && <span className="font-normal text-white/75"> · {ageLabel(p.age)}</span>}
          {where && <span className="font-normal text-white/75"> · {where}</span>}
        </span>
        {p.verified && <VerifiedBadge />}
        {p.plus && (
          <span title="Plus member" aria-label="Plus member">
            👑
          </span>
        )}
        {p.isNew && <span className="rounded bg-gold px-1.5 text-[10px] font-bold text-[#1a1608]">NEW</span>}
      </span>
      <span className={`${pill} font-medium`}>
        <i className="rc-blink h-[7px] w-[7px] rounded-full bg-lime" aria-hidden />
        <CallTimer since={call.matchStartedAt} />
      </span>
      {line && <span className={`${pill} max-w-[22rem] truncate text-lime max-md:hidden`}>{line}</span>}
    </>
  );
}
/** mm:ss since the match started (00:00 between matches). */
function CallTimer({ since }: { since: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [since]);
  const s = since ? Math.max(0, Math.floor((now - since) / 1000)) : 0;
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return (
    <span className="tabular-nums" aria-label="Call length">
      {h ? `${h}:` : ''}
      {mm}:{ss}
    </span>
  );
}
