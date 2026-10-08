'use client';

/**
 * Google sign-in leaves its own pages in the browser history, so after signing
 * in, Back would land on Google's account picker. We remember where the
 * sign-in started; once signed in we step back to that page and replace it
 * with the destination, so Back skips Google entirely.
 */
const START_KEY = 'rc:googleStart';
const NEXT_KEY = 'rc:googleNext';

/** Position of the current page in this tab's history. */
function historyIndex(): number | null {
  const nav = (window as unknown as { navigation?: { currentEntry?: { index: number } } }).navigation;
  if (nav?.currentEntry && nav.currentEntry.index >= 0) return nav.currentEntry.index;
  // Without the Navigation API, assume we're the last entry (true right after a click).
  return window.history.length < 50 ? window.history.length - 1 : null;
}

/** Call when leaving for Google. */
export function markGoogleStart() {
  try {
    const i = historyIndex();
    if (i === null) sessionStorage.removeItem(START_KEY);
    else sessionStorage.setItem(START_KEY, String(i));
  } catch {
    // Storage blocked: Back will just show Google's page, as before.
  }
}

/** Call once signed in: goes to `next`, removing Google's pages from Back. */
export function leaveGoogleFor(next: string, fallback: (next: string) => void) {
  try {
    const start = Number(sessionStorage.getItem(START_KEY));
    sessionStorage.removeItem(START_KEY);
    const here = historyIndex();
    const steps = here === null || !Number.isInteger(start) || start < 0 ? 0 : here - start;
    if (steps >= 1 && steps <= 10) {
      sessionStorage.setItem(NEXT_KEY, next);
      window.history.go(-steps);
      return;
    }
  } catch {
    // fall through
  }
  fallback(next);
}

/** Runs on every page: finishes a pending sign-in return by replacing this page with the destination. */
export function finishGoogleReturn() {
  try {
    const next = sessionStorage.getItem(NEXT_KEY);
    if (!next) return;
    sessionStorage.removeItem(NEXT_KEY);
    // A full load, so the page shows the signed-in state.
    window.location.replace(next);
  } catch {
    // ignore
  }
}
