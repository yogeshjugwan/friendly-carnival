'use client';

/**
 * Real rewarded video ads with Google Ad Manager (GPT "rewarded" out-of-page
 * format). Set NEXT_PUBLIC_GAM_REWARDED_UNIT to your ad unit path, e.g.
 * "/1234567/randomcall_rewarded". Without it (or when no ad fills), callers fall
 * back to the built-in ad countdown.
 */

export const GAM_REWARDED_UNIT = process.env.NEXT_PUBLIC_GAM_REWARDED_UNIT || '';

type Result = 'granted' | 'closed' | 'unavailable';

interface GptEvent {
  slot: unknown;
  isEmpty?: boolean;
  makeRewardedVisible?: () => void;
}
interface GoogleTag {
  cmd: { push(fn: () => void): void };
  defineOutOfPageSlot(unit: string, format: unknown): { addService(s: unknown): unknown } | null;
  enums: { OutOfPageFormat: { REWARDED: unknown } };
  pubads(): { addEventListener(name: string, fn: (e: GptEvent) => void): void; removeEventListener?(name: string, fn: (e: GptEvent) => void): void };
  enableServices(): void;
  display(slot: unknown): void;
  destroySlots(slots?: unknown[]): void;
}

let scriptPromise: Promise<void> | null = null;
const loadGpt = () =>
  (scriptPromise ??= new Promise<void>((resolve, reject) => {
    const w = window as unknown as { googletag?: GoogleTag };
    w.googletag = w.googletag || ({ cmd: [] } as unknown as GoogleTag);
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('gpt.js failed to load'));
    };
    document.head.appendChild(s);
  }));

/** Shows one rewarded ad. Resolves when it's closed (granted or not) or can't be shown. */
export async function showRewardedAd(unit = GAM_REWARDED_UNIT): Promise<Result> {
  if (!unit) return 'unavailable';
  try {
    await loadGpt();
  } catch {
    return 'unavailable';
  }
  const googletag = (window as unknown as { googletag: GoogleTag }).googletag;
  return new Promise<Result>((resolve) => {
    let done = false;
    let granted = false;
    let slot: { addService(s: unknown): unknown } | null = null;
    const finish = (r: Result) => {
      if (done) return;
      done = true;
      window.clearTimeout(noFill);
      if (slot) googletag.destroySlots([slot]);
      resolve(r);
    };
    // No ad within 10 s: give up and let the caller use the fallback.
    const noFill = window.setTimeout(() => finish('unavailable'), 10_000);
    googletag.cmd.push(() => {
      slot = googletag.defineOutOfPageSlot(unit, googletag.enums.OutOfPageFormat.REWARDED);
      if (!slot) return finish('unavailable');
      slot.addService(googletag.pubads());
      const pubads = googletag.pubads();
      pubads.addEventListener('rewardedSlotReady', (e) => {
        if (e.slot !== slot) return;
        window.clearTimeout(noFill);
        e.makeRewardedVisible?.();
      });
      pubads.addEventListener('rewardedSlotGranted', (e) => {
        if (e.slot === slot) granted = true;
      });
      pubads.addEventListener('rewardedSlotClosed', (e) => {
        if (e.slot === slot) finish(granted ? 'granted' : 'closed');
      });
      pubads.addEventListener('slotRenderEnded', (e) => {
        if (e.slot === slot && e.isEmpty) finish('unavailable');
      });
      googletag.enableServices();
      googletag.display(slot);
    });
  });
}
