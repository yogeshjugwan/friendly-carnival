'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ADSENSE_CLIENT, AD_SLOTS, type AdPlacement } from '@/lib/ads';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

const HOUSE_ADS = [
  { title: 'Keep your settings everywhere', body: 'Create a free account to save your interests and preferences.', cta: 'Sign up free', href: '/signup' },
  { title: 'Want to stay more private?', body: 'Hide your country from the people you meet.', cta: 'Hide your location', href: '/settings' },
  { title: 'Be kind, stay safe', body: 'Read the community guidelines. Use 🛡 Safety to report or block anyone.', cta: 'Read guidelines', href: '/guidelines' },
  { title: 'Camera shy?', body: 'Switch to text-only chat any time from the start screen.', cta: 'Learn more', href: '/settings' },
];

/** Our own promo, used until an ad network is configured (or when an ad fails to fill). */
function HouseAd({ seed }: { seed: number }) {
  const ad = HOUSE_ADS[seed % HOUSE_ADS.length]!;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-[#1f3b73] to-[#2f7de1] px-4 pb-3 pt-5 text-center text-white sm:gap-2">
      <p className="text-base font-semibold sm:text-lg">{ad.title}</p>
      <p className="max-w-xs text-xs text-blue-100 sm:text-sm">{ad.body}</p>
      <Link href={ad.href} className="mt-1 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-[#1f3b73] hover:bg-blue-50">
        {ad.cta}
      </Link>
    </div>
  );
}

let scriptRequested = false;
function loadAdSense() {
  if (scriptRequested || !ADSENSE_CLIENT) return;
  scriptRequested = true;
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`;
  document.head.appendChild(s);
}

/**
 * An ad box. Shows a Google AdSense unit when NEXT_PUBLIC_ADSENSE_CLIENT and the
 * placement's slot id are set; otherwise a rotating house promo.
 * `refreshKey` changes force a new ad (e.g. each new match).
 */
export function AdSlot({ placement, refreshKey = 0, className = '' }: { placement: AdPlacement; refreshKey?: number; className?: string }) {
  const slot = AD_SLOTS[placement];
  const useNetwork = !!(ADSENSE_CLIENT && slot);
  const insRef = useRef<HTMLModElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!useNetwork) return;
    loadAdSense();
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      setFailed(true);
    }
  }, [useNetwork, refreshKey]);

  return (
    <aside aria-label="Advertisement" className={`relative overflow-hidden rounded-xl bg-panel ${className}`}>
      <span className="absolute left-2 top-1 z-10 text-[10px] uppercase tracking-wide text-white/60">Ad</span>
      {useNetwork && !failed ? (
        <ins
          key={refreshKey}
          ref={insRef}
          className="adsbygoogle block h-full w-full"
          style={{ display: 'block' }}
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      ) : (
        <HouseAd seed={refreshKey + (placement === 'break' ? 1 : 0)} />
      )}
    </aside>
  );
}
