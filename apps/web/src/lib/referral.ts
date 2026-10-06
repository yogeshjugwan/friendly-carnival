'use client';

import type { PublicUser } from '@rc/shared';

/** Invite code from a /r/<code> link, kept until the visitor has an account. */
const REF_KEY = 'rc.ref';

export function saveInviteCode(code: string) {
  try {
    window.localStorage.setItem(REF_KEY, code.toLowerCase());
  } catch {
    /* storage unavailable */
  }
}

export function pendingInviteCode(): string | null {
  try {
    return window.localStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
}

const NEW_ACCOUNT_MS = 24 * 60 * 60_000;

/** Links a brand-new account to the invite it came from (once; older accounts just drop the code). */
export async function claimInvite(user: PublicUser, send: (code: string) => Promise<unknown>) {
  const code = pendingInviteCode();
  if (!code) return;
  if (Date.now() - user.createdAt > NEW_ACCOUNT_MS) {
    window.localStorage.removeItem(REF_KEY);
    return;
  }
  try {
    await send(code);
    window.localStorage.removeItem(REF_KEY);
  } catch (e) {
    // Keep it only if the server couldn't be reached; any answer is final.
    if ((e as { status?: number }).status !== 0) window.localStorage.removeItem(REF_KEY);
  }
}
