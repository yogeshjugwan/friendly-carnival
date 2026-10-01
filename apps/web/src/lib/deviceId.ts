'use client';

const KEY = 'rc.deviceId';
let memory: string | null = null;

/**
 * A random id for this browser, kept in localStorage. It lets bans and blocks
 * follow a device without any account. Falls back to a per-tab id when storage
 * is unavailable.
 */
export function getDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    memory ??= crypto.randomUUID();
    return memory;
  }
}
