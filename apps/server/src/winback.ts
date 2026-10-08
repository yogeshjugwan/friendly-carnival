import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AccountStore, User } from './accounts.ts';
import { escape, type Mail, type Mailer } from './mailer.ts';

/**
 * Win-back emails: people with a confirmed email who haven't been back for a
 * week get at most one friendly nudge every two weeks, with a one-click
 * unsubscribe. Runs only with a real mailer (RESEND_API_KEY).
 */
const DAY = 86_400_000;
export const WINBACK_AWAY_MS = 7 * DAY;
export const WINBACK_EVERY_MS = 14 * DAY;

/** Server-wide secret for unsubscribe links (stored once in the database). */
export async function unsubscribeSecret(accounts: AccountStore): Promise<string> {
  return (await accounts.appSecret('unsubscribe')) ?? (await accounts.initAppSecret('unsubscribe', randomBytes(32).toString('base64url')));
}

export const unsubscribeToken = (userId: string, secret: string) =>
  createHmac('sha256', secret).update(`unsubscribe:${userId}`).digest('base64url').slice(0, 32);

export function validUnsubscribe(userId: unknown, token: unknown, secret: string): userId is string {
  if (typeof userId !== 'string' || typeof token !== 'string') return false;
  const a = Buffer.from(unsubscribeToken(userId, secret));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function winbackEmail(user: User, opts: { webUrl: string; serverUrl: string; secret: string; online: number }): Mail {
  const t = unsubscribeToken(user.id, opts.secret);
  const q = `u=${encodeURIComponent(user.id)}&t=${encodeURIComponent(t)}`;
  const unsubscribePage = `${opts.webUrl}/unsubscribe?${q}`;
  const oneClick = `${opts.serverUrl}/auth/unsubscribe?${q}`;
  const start = `${opts.webUrl}/?utm_source=email&utm_campaign=winback`;
  const likes = user.settings.interests.slice(0, 2);
  const crowd = opts.online >= 10 ? `${opts.online.toLocaleString('en-IN')} people are on randomCall right now` : 'New people join randomCall every minute';
  const intro = `It's been a while! ${crowd}${likes.length ? ` — including people who like ${likes.join(' and ')}` : ''}. Your daily coin reward is waiting too 🎁`;
  return {
    to: user.email,
    subject: 'People are waiting to meet you 👋',
    text: `${intro}\n\nStart chatting: ${start}\n\nDon't want these emails? Unsubscribe: ${unsubscribePage}\n\n— randomCall`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px">
<p>${escape(intro)}</p>
<p><a href="${escape(start)}" style="display:inline-block;background:#2f7de1;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Start chatting</a></p>
<p style="color:#64748b;font-size:12px">You get this because you have a randomCall account. <a href="${escape(unsubscribePage)}" style="color:#64748b">Unsubscribe</a></p>
<p style="color:#64748b;font-size:13px">— randomCall</p></div>`,
    headers: { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

/** Sends one batch; returns how many emails went out. */
export async function runWinback(deps: {
  accounts: AccountStore;
  mailer: Mailer;
  webUrl: string;
  serverUrl: string;
  online: number;
  now?: number;
  limit?: number;
}): Promise<number> {
  const now = deps.now ?? Date.now();
  const secret = await unsubscribeSecret(deps.accounts);
  const users = await deps.accounts.winbackCandidates(now - WINBACK_AWAY_MS, now - WINBACK_EVERY_MS, deps.limit ?? 100);
  let sent = 0;
  for (const user of users) {
    // Mark first, so a failure can't make us email the same person twice in a row.
    await deps.accounts.markWinbackSent(user.id, now);
    try {
      await deps.mailer.send(winbackEmail(user, { webUrl: deps.webUrl, serverUrl: deps.serverUrl, secret, online: deps.online }));
      sent++;
    } catch (e) {
      console.error('[winback]', e);
    }
  }
  return sent;
}
