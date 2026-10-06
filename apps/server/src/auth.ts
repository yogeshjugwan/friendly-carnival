import { randomInt } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  MAX_PASSWORD_LENGTH,
  MAX_VERIFY_PHOTO,
  MIN_PASSWORD_LENGTH,
  VERIFY_GESTURES,
  type PublicUser,
  type ReferralInfo,
  type VerifyGestureId,
} from '@rc/shared';
import { hashPassword, publicPlus, verifyPassword, type AccountStore, type User } from './accounts.ts';
import { bearer, cors, RateLimiter, readJson, sendJson } from './http.ts';
import { linkEmail, type Mailer } from './mailer.ts';
import { parseSettings } from './validate.ts';

export interface AuthDeps {
  accounts: AccountStore;
  mailer: Mailer;
  /** Public URL of the web app, used in email links. */
  webUrl: string;
  origins: (string | RegExp)[];
  /** Rate-limit key for the caller (hashed IP). */
  clientKey: (req: IncomingMessage) => string;
}

/** An invite link can be attached up to a day after sign-up. */
const REFERRAL_WINDOW_MS = 24 * 60 * 60_000;

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
/** Used to keep login timing similar whether or not the email exists. */
let dummyHash: Promise<string> | null = null;

export const publicUser = (u: User): PublicUser => ({
  id: u.id,
  email: u.email,
  emailVerified: u.emailVerified,
  createdAt: u.createdAt,
  settings: u.settings,
  plus: publicPlus(u.plus),
  wallet: { coins: u.coins, boostUntil: u.boostUntil && u.boostUntil > Date.now() ? u.boostUntil : null },
  verification: u.verifiedAt ? 'verified' : (u.verifyStatus ?? 'none'),
});

const passwordProblem = (p: unknown): string | null => {
  if (typeof p !== 'string') return 'Password is required';
  if (p.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (p.length > MAX_PASSWORD_LENGTH) return 'Password is too long';
  return null;
};

export function createAuthHandler(deps: AuthDeps) {
  const { accounts, mailer } = deps;
  // Credential endpoints: 20 attempts per 10 minutes per IP.
  const strict = new RateLimiter(20, 10 * 60_000);
  // Verification: the gesture is picked here, so an old photo can't be reused.
  const challenges = new Map<string, { gesture: VerifyGestureId; expiresAt: number }>();
  const CHALLENGE_MS = 10 * 60_000;
  const selfieLimit = new RateLimiter(5, 60 * 60_000);

  const sendVerification = async (user: User) => {
    await accounts.deleteTokensFor(user.id, 'verify');
    const token = await accounts.createToken(user.id, 'verify');
    const url = `${deps.webUrl}/verify?token=${encodeURIComponent(token)}`;
    await mailer.send(
      linkEmail(user.email, 'Confirm your randomCall email', 'Welcome to randomCall! Please confirm your email address.', 'Confirm email', url, 'This link expires in 48 hours. If you did not sign up, ignore this email.'),
    );
  };

  /** Logged-in user for the request's bearer token. */
  const currentUser = async (req: IncomingMessage) => {
    const token = bearer(req);
    return token ? accounts.useToken(token, 'session') : null;
  };

  return async function handleAuth(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://local');
    if (!url.pathname.startsWith('/auth/')) return false;
    if (cors(req, res, deps.origins)) return true;
    const route = `${req.method} ${url.pathname}`;
    const fail = (status: number, error: string) => (sendJson(res, status, { error }), true);

    try {
      if (['POST /auth/signup', 'POST /auth/login', 'POST /auth/forgot', 'POST /auth/reset'].includes(route)) {
        if (!strict.allow(deps.clientKey(req))) return fail(429, 'Too many attempts. Try again in a few minutes.');
      }

      if (route === 'POST /auth/signup') {
        const { email, password } = await readJson(req);
        if (typeof email !== 'string' || !EMAIL.test(email.trim())) return fail(400, 'Enter a valid email address');
        const problem = passwordProblem(password);
        if (problem) return fail(400, problem);
        const user = await accounts.createUser(email, await hashPassword(password as string));
        if (user === 'exists') return fail(409, 'An account with this email already exists');
        await sendVerification(user).catch((e) => console.error('[mail]', e));
        const token = await accounts.createToken(user.id, 'session');
        return sendJson(res, 201, { token, user: publicUser(user) }), true;
      }

      if (route === 'POST /auth/login') {
        const { email, password } = await readJson(req);
        if (typeof email !== 'string' || typeof password !== 'string') return fail(400, 'Email and password are required');
        const user = await accounts.userByEmail(email);
        dummyHash ??= hashPassword('timing-equalizer');
        const ok = user ? await verifyPassword(password, user.passwordHash) : (await verifyPassword(password, await dummyHash), false);
        if (!user || !ok) return fail(401, 'Wrong email or password');
        const token = await accounts.createToken(user.id, 'session');
        return sendJson(res, 200, { token, user: publicUser(user) }), true;
      }

      if (route === 'POST /auth/verify') {
        const { token } = await readJson(req);
        const user = typeof token === 'string' ? await accounts.useToken(token, 'verify') : null;
        if (!user) return fail(400, 'This confirmation link is invalid or has expired');
        await accounts.markVerified(user.id);
        return sendJson(res, 200, { ok: true }), true;
      }

      if (route === 'POST /auth/forgot') {
        const { email } = await readJson(req);
        const user = typeof email === 'string' ? await accounts.userByEmail(email) : null;
        if (user) {
          await accounts.deleteTokensFor(user.id, 'reset');
          const token = await accounts.createToken(user.id, 'reset');
          const link = `${deps.webUrl}/reset?token=${encodeURIComponent(token)}`;
          await mailer
            .send(linkEmail(user.email, 'Reset your randomCall password', 'Someone asked to reset your randomCall password.', 'Choose a new password', link, 'This link expires in 1 hour. If it was not you, ignore this email.'))
            .catch((e) => console.error('[mail]', e));
        }
        // Same answer either way, so the form can't be used to find accounts.
        return sendJson(res, 200, { ok: true }), true;
      }

      if (route === 'POST /auth/reset') {
        const { token, password } = await readJson(req);
        const problem = passwordProblem(password);
        if (problem) return fail(400, problem);
        const user = typeof token === 'string' ? await accounts.useToken(token, 'reset') : null;
        if (!user) return fail(400, 'This reset link is invalid or has expired');
        await accounts.setPassword(user.id, await hashPassword(password as string));
        await accounts.deleteTokensFor(user.id, 'session'); // sign out everywhere
        await accounts.markVerified(user.id); // they proved they own the inbox
        return sendJson(res, 200, { ok: true }), true;
      }

      // Everything below needs a logged-in user.
      const user = await currentUser(req);
      if (!user) return fail(401, 'Please log in');

      if (route === 'GET /auth/me') return sendJson(res, 200, publicUser(user)), true;

      if (route === 'POST /auth/logout') {
        await accounts.deleteToken(bearer(req)!);
        return sendJson(res, 200, { ok: true }), true;
      }

      if (route === 'POST /auth/resend-verification') {
        if (!user.emailVerified) await sendVerification(user);
        return sendJson(res, 200, { ok: true }), true;
      }

      if (route === 'POST /auth/settings') {
        const settings = parseSettings((await readJson(req)).settings);
        if (!settings) return fail(400, 'Invalid settings');
        await accounts.updateSettings(user.id, settings);
        return sendJson(res, 200, publicUser({ ...user, settings })), true;
      }

      if (route === 'GET /auth/referral') {
        const [code, counts] = await Promise.all([accounts.referralCode(user.id), accounts.referralCounts(user.id)]);
        return sendJson(res, 200, { code, ...counts } satisfies ReferralInfo), true;
      }

      // Signed up with someone's invite link: only for new accounts, once.
      if (route === 'POST /auth/referral') {
        const { code } = await readJson(req);
        if (typeof code !== 'string' || !/^[a-z0-9]{4,16}$/i.test(code)) return fail(400, 'Invalid invite code');
        if (Date.now() - user.createdAt > REFERRAL_WINDOW_MS) return fail(409, 'Invite links only work for new accounts');
        const referrer = await accounts.userByReferralCode(code);
        if (!referrer || referrer.id === user.id) return fail(404, 'Invite link not found');
        if (!(await accounts.setReferredBy(user.id, referrer.id))) return fail(409, 'You already used an invite link');
        return sendJson(res, 200, { ok: true }), true;
      }

      if (route === 'POST /auth/verification/challenge') {
        if (user.verifiedAt) return fail(409, 'You are already verified');
        const now = Date.now();
        for (const [id, c] of challenges) if (c.expiresAt < now) challenges.delete(id);
        const g = VERIFY_GESTURES[randomInt(VERIFY_GESTURES.length)];
        challenges.set(user.id, { gesture: g.id, expiresAt: now + CHALLENGE_MS });
        return sendJson(res, 200, { gesture: g.id, expiresAt: now + CHALLENGE_MS }), true;
      }

      if (route === 'POST /auth/verification') {
        if (user.verifiedAt) return fail(409, 'You are already verified');
        if (!selfieLimit.allow(user.id)) return fail(429, 'Too many tries. Try again later.');
        const challenge = challenges.get(user.id);
        if (!challenge || challenge.expiresAt < Date.now()) return fail(400, 'That took too long. Start again.');
        const { photo } = await readJson(req, MAX_VERIFY_PHOTO + 1024);
        if (typeof photo !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo) || photo.length > MAX_VERIFY_PHOTO) {
          return fail(400, 'Invalid photo');
        }
        challenges.delete(user.id);
        await accounts.submitVerification(user.id, challenge.gesture, photo);
        return sendJson(res, 200, publicUser({ ...user, verifyStatus: 'pending' })), true;
      }

      if (route === 'POST /auth/password') {
        const { current, next } = await readJson(req);
        if (typeof current !== 'string' || !(await verifyPassword(current, user.passwordHash))) return fail(400, 'Current password is wrong');
        const problem = passwordProblem(next);
        if (problem) return fail(400, problem);
        await accounts.setPassword(user.id, await hashPassword(next as string));
        return sendJson(res, 200, { ok: true }), true;
      }

      if (route === 'POST /auth/delete') {
        const { password } = await readJson(req);
        if (typeof password !== 'string' || !(await verifyPassword(password, user.passwordHash))) return fail(400, 'Password is wrong');
        await accounts.deleteUser(user.id);
        return sendJson(res, 200, { ok: true }), true;
      }

      return fail(404, 'Not found');
    } catch (e) {
      if (e instanceof SyntaxError) return fail(400, 'Invalid request');
      console.error('[auth]', e);
      return fail(500, 'Server error');
    }
  };
}
