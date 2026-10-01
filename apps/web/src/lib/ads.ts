/**
 * Ad configuration. Set these in Vercel once AdSense approves the site:
 *   NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-1234567890123456
 *   NEXT_PUBLIC_ADSENSE_SLOT_SIDEBAR=1111111111   (display ad unit id)
 *   NEXT_PUBLIC_ADSENSE_SLOT_BREAK=2222222222     (display ad unit id)
 * Without them, slots show our own "house" promos.
 */
export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || '';
export const AD_SLOTS = {
  sidebar: process.env.NEXT_PUBLIC_ADSENSE_SLOT_SIDEBAR || '',
  break: process.env.NEXT_PUBLIC_ADSENSE_SLOT_BREAK || '',
} as const;
export type AdPlacement = keyof typeof AD_SLOTS;

/** How long the partner tile shows an ad before revealing the next stranger. */
export const AD_BREAK_MS = Number(process.env.NEXT_PUBLIC_AD_BREAK_MS ?? 3000);
