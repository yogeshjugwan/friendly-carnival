import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { hashPassword, normalizeEmail, type AccountStore } from './accounts.ts';
import { cors, sendJson } from './http.ts';

/**
 * "Continue with Google" (OAuth 2.0 authorization-code flow):
 * GET /auth/google/start → Google consent → GET /auth/google/callback, which
 * signs the user in (creating the account on first use) and sends them back to
 * the web app with a session token in the URL fragment (never sent to servers).
 */

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

export interface GoogleDeps {
  google: GoogleConfig | null;
  accounts: AccountStore;
  webUrl: string;
  /** Public URL of this server; Google redirects back to `${serverUrl}/auth/google/callback`. */
  serverUrl: string;
  origins: (string | RegExp)[];
  /** Injectable for tests. */
  fetch?: typeof fetch;
}

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const STATE_TTL_MS = 10 * 60_000;
const MAX_PENDING = 10_000;

/** Only same-site paths, so ?next= can't send people to another website. */
const safeNext = (next: string | null) => (next && next.startsWith('/') && !next.startsWith('//') ? next : '/');

export function createGoogleHandler(deps: GoogleDeps) {
  const doFetch = deps.fetch ?? fetch;
  const callbackUrl = `${deps.serverUrl}/auth/google/callback`;
  /** state → where to go afterwards; one use, short-lived. */
  const pending = new Map<string, { next: string; expires: number }>();

  const redirect = (res: ServerResponse, location: string) => {
    res.writeHead(302, { location, 'cache-control': 'no-store' });
    res.end();
    return true;
  };
  const backToLogin = (res: ServerResponse, reason: string) => redirect(res, `${deps.webUrl}/login?error=${encodeURIComponent(reason)}`);

  return async function handleGoogle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://local');

    if (url.pathname === '/auth/providers') {
      if (cors(req, res, deps.origins)) return true;
      return sendJson(res, 200, { google: !!deps.google }), true;
    }
    if (!url.pathname.startsWith('/auth/google/') || req.method !== 'GET') return false;
    const google = deps.google;
    if (!google) return backToLogin(res, 'google_disabled');

    if (url.pathname === '/auth/google/start') {
      const now = Date.now();
      for (const [k, v] of pending) if (v.expires < now) pending.delete(k);
      if (pending.size >= MAX_PENDING) return backToLogin(res, 'busy');
      const state = randomBytes(24).toString('base64url');
      pending.set(state, { next: safeNext(url.searchParams.get('next')), expires: now + STATE_TTL_MS });
      const params = new URLSearchParams({
        client_id: google.clientId,
        redirect_uri: callbackUrl,
        response_type: 'code',
        scope: 'openid email',
        state,
        prompt: 'select_account',
      });
      return redirect(res, `${AUTH_URL}?${params}`);
    }

    if (url.pathname === '/auth/google/callback') {
      const state = url.searchParams.get('state') ?? '';
      const entry = pending.get(state);
      pending.delete(state);
      if (!entry || entry.expires < Date.now()) return backToLogin(res, 'expired');
      const code = url.searchParams.get('code');
      if (!code) return backToLogin(res, 'canceled');

      try {
        const tokenRes = await doFetch(TOKEN_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: google.clientId,
            client_secret: google.clientSecret,
            redirect_uri: callbackUrl,
            grant_type: 'authorization_code',
          }),
        });
        if (!tokenRes.ok) return backToLogin(res, 'google_failed');
        const { access_token } = (await tokenRes.json()) as { access_token?: string };
        const infoRes = await doFetch(USERINFO_URL, { headers: { authorization: `Bearer ${access_token}` } });
        if (!infoRes.ok) return backToLogin(res, 'google_failed');
        const info = (await infoRes.json()) as { email?: string; email_verified?: boolean };
        if (!info.email || info.email_verified !== true) return backToLogin(res, 'unverified');

        const email = normalizeEmail(info.email);
        let user = await deps.accounts.userByEmail(email);
        let created = false;
        if (!user) {
          // No password yet: an unguessable one; "Forgot password" can set a real one later.
          const made = await deps.accounts.createUser(email, await hashPassword(randomBytes(32).toString('base64url')));
          user = made === 'exists' ? await deps.accounts.userByEmail(email) : made;
          created = made !== 'exists';
        }
        if (!user) return backToLogin(res, 'google_failed');
        // Google checked the address, so it counts as confirmed.
        if (!user.emailVerified) await deps.accounts.markVerified(user.id);
        const token = await deps.accounts.createToken(user.id, 'session');
        const fragment = new URLSearchParams({ token, next: entry.next, ...(created ? { new: '1' } : {}) });
        return redirect(res, `${deps.webUrl}/auth/google#${fragment}`);
      } catch (e) {
        console.error('[google]', e);
        return backToLogin(res, 'google_failed');
      }
    }

    return false;
  };
}
