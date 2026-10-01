'use client';

import type { UserSettings } from '@rc/shared';

const KEY = 'rc.settings';
const LEGACY_RECONNECT_KEY = 'rc.allowReconnect';
const EVENT = 'rc:settings';

export const DEFAULT_SETTINGS: UserSettings = { gender: null, interests: [], allowReconnect: true, hideCountry: false };

/**
 * The browser copy of the user's settings. Guests only have this; for logged-in
 * users it mirrors the account (see AuthProvider), so the call screen can read
 * one place either way.
 */
export function loadSettings(): UserSettings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<UserSettings>) };
    const legacy = window.localStorage.getItem(LEGACY_RECONNECT_KEY);
    return { ...DEFAULT_SETTINGS, allowReconnect: legacy !== 'false' };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function storeSettings(settings: UserSettings) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Calls back whenever settings change in this tab or another. */
export function onSettingsChange(cb: () => void): () => void {
  const storage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', storage);
  };
}
