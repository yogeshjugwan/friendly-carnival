import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { NO_PLUS, type AccountStore } from './accounts.ts';
import { cors, readJson } from './http.ts';
import { dayOf, type Analytics } from './analytics.ts';
import type { Safety } from './safety.ts';
import type { SafetyStore } from './store.ts';

const HOUR = 3_600_000;

export interface AdminDeps {
  store: SafetyStore;
  safety: Safety;
  token: string | undefined;
  origins: (string | RegExp)[];
  online: () => number;
  /** People in the low-trust shadow pool right now. */
  shadowPool?: () => number;
  accounts?: AccountStore;
  onPlusChanged?: (userId: string) => void;
  onVerifiedChanged?: (userId: string, verified: boolean) => void;
  analytics?: Analytics;
  /** Rate-limit key for the caller (hashed IP). */
  clientKey?: (req: IncomingMessage) => string;
}

/** Wrong admin tokens: 10 per 10 minutes per IP, then everything is refused for a while. */
const failures = new Map<string, { count: number; resetAt: number }>();
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 10 * 60_000;
const tooManyFailures = (key: string, now = Date.now()) => {
  const f = failures.get(key);
  return !!f && f.resetAt > now && f.count >= MAX_FAILURES;
};
const noteFailure = (key: string, now = Date.now()) => {
  const f = failures.get(key);
  if (!f || f.resetAt <= now) failures.set(key, { count: 1, resetAt: now + FAILURE_WINDOW_MS });
  else f.count++;
  if (failures.size > 10_000) for (const [k, v] of failures) if (v.resetAt <= now) failures.delete(k);
};

const sameToken = (given: string, expected: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Handles /admin/* requests. Returns false when the URL is not an admin route. */
export async function handleAdmin(req: IncomingMessage, res: ServerResponse, deps: AdminDeps): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://local');
  if (!url.pathname.startsWith('/admin/')) return false;

  if (cors(req, res, deps.origins)) return true;

  const send = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  if (!deps.token) return send(503, { error: 'Admin is disabled: set ADMIN_TOKEN on the server' }), true;
  const caller = deps.clientKey?.(req) ?? 'unknown';
  if (tooManyFailures(caller)) return send(429, { error: 'Too many wrong tokens. Try again later.' }), true;
  const auth = req.headers.authorization ?? '';
  if (!auth.startsWith('Bearer ') || !sameToken(auth.slice(7), deps.token)) {
    noteFailure(caller);
    return send(401, { error: 'Unauthorized' }), true;
  }

  try {
    const { store, safety } = deps;
    const parts = url.pathname.split('/').filter(Boolean); // ['admin', resource, id?, action?]
    const [, resource, id, action] = parts;

    if (req.method === 'GET' && resource === 'summary') {
      const [open, bans, appeals, oldest] = await Promise.all([
        store.listReports('open', 1_000),
        store.listBans(true),
        store.listAppeals('open'),
        store.oldestOpenReportAt(),
      ]);
      return (
        send(200, {
          openReports: open.length,
          oldestOpenAgeMs: oldest ? Date.now() - oldest : null,
          activeBans: bans.length,
          openAppeals: appeals.length,
          online: deps.online(),
          shadowPool: deps.shadowPool?.() ?? 0,
        }),
        true
      );
    }

    // Daily numbers for the dashboard: ?days=30 (max 365).
    if (req.method === 'GET' && resource === 'analytics' && deps.analytics) {
      const n = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30));
      const now = Date.now();
      const days = Array.from({ length: n }, (_, i) => dayOf(now - (n - 1 - i) * 24 * HOUR));
      const since = now - n * 24 * HOUR;
      const [stored, today, acc] = await Promise.all([
        store.listStats(days[0]),
        deps.analytics.today(),
        deps.accounts?.accountStats(since) ?? Promise.resolve(null),
      ]);
      const byDay = new Map(stored.map((d) => [d.day, d.values]));
      byDay.set(today.day, today.values);
      const extra = new Map<string, Record<string, number>>();
      const add = (day: string, metric: string, by: number) => {
        if (!extra.has(day)) extra.set(day, {});
        const e = extra.get(day)!;
        e[metric] = (e[metric] ?? 0) + by;
      };
      for (const t of acc?.signups ?? []) add(dayOf(t), 'signups', 1);
      for (const p of acc?.purchases ?? []) {
        add(dayOf(p.at), 'coinPurchases', 1);
        add(dayOf(p.at), 'coinsSold', p.coins);
      }
      return (
        send(200, {
          days: days.map((day) => ({ day, values: { ...(byDay.get(day) ?? {}), ...(extra.get(day) ?? {}) } })),
          totals: {
            users: acc?.users ?? null,
            plusActive: acc?.plusActive ?? null,
            verified: acc?.verified ?? null,
            online: deps.online(),
          },
        }),
        true
      );
    }

    if (req.method === 'GET' && resource === 'reports') {
      const status = url.searchParams.get('status');
      const filter = status === 'open' || status === 'actioned' || status === 'dismissed' ? status : undefined;
      return send(200, await store.listReports(filter, 200)), true;
    }

    if (req.method === 'POST' && resource === 'reports' && id && action === 'action') {
      const body = await readJson(req);
      const report = (await store.listReports(undefined, 5_000)).find((r) => r.id === id);
      if (!report) return send(404, { error: 'Report not found' }), true;
      if (body.action === 'dismiss') return send(200, await store.resolveReport(id, 'dismissed', 'dismissed by admin')), true;
      if (body.action === 'ban') {
        const hours = body.durationHours;
        const durationMs = hours === null ? null : typeof hours === 'number' && hours > 0 && hours <= 24 * 365 ? hours * HOUR : NaN;
        if (Number.isNaN(durationMs)) return send(400, { error: 'durationHours must be a positive number or null' }), true;
        const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 200) : `Violation: ${report.reason}`;
        const includeIp = body.includeIp === true;
        const target = { deviceId: report.targetDevice, ipHash: report.targetIpHash, userId: report.targetUserId };
        const ban = await safety.ban(target, durationMs, reason, 'admin', {
          includeIp,
        });
        await store.resolveReport(id, 'actioned', `banned ${hours === null ? 'permanently' : `${hours} h`}${includeIp ? ' + IP' : ''}`);
        return send(200, ban), true;
      }
      return send(400, { error: 'action must be "ban" or "dismiss"' }), true;
    }

    // Complimentary Plus (support, testers, giveaways): { email, days }; days 0 removes it.
    if (req.method === 'POST' && resource === 'plus' && deps.accounts) {
      const body = await readJson(req);
      const days = body.days;
      if (typeof body.email !== 'string' || typeof days !== 'number' || days < 0 || days > 3650) {
        return send(400, { error: 'email and days (0–3650) are required' }), true;
      }
      const user = await deps.accounts.userByEmail(body.email);
      if (!user) return send(404, { error: 'No account with that email' }), true;
      if (user.plus.status && user.plus.status !== 'admin' && user.plus.status !== 'canceled' && days > 0) {
        return send(409, { error: 'This user already has a paid subscription' }), true;
      }
      const plus = days === 0 ? { ...NO_PLUS } : { ...NO_PLUS, status: 'admin', until: Date.now() + days * 24 * HOUR };
      await deps.accounts.setPlus(user.id, plus);
      deps.onPlusChanged?.(user.id);
      return send(200, { email: user.email, plus }), true;
    }

    // Support / testing: { email, coins } (negative removes coins).
    if (req.method === 'POST' && resource === 'coins' && deps.accounts) {
      const body = await readJson(req);
      const coins = body.coins;
      if (typeof body.email !== 'string' || typeof coins !== 'number' || !Number.isInteger(coins) || Math.abs(coins) > 100_000) {
        return send(400, { error: 'email and a whole number of coins are required' }), true;
      }
      const user = await deps.accounts.userByEmail(body.email);
      if (!user) return send(404, { error: 'No account with that email' }), true;
      const balance = await deps.accounts.changeCoins(user.id, coins, 'admin');
      if (balance === null) return send(409, { error: 'That would make the balance negative' }), true;
      deps.onPlusChanged?.(user.id);
      return send(200, { email: user.email, coins: balance }), true;
    }

    // ✓ Verified badge review: selfies with the requested gesture.
    if (req.method === 'GET' && resource === 'verifications' && deps.accounts) {
      return send(200, await deps.accounts.listPendingVerifications()), true;
    }

    if (req.method === 'POST' && resource === 'verifications' && id && action === 'resolve' && deps.accounts) {
      const body = await readJson(req);
      if (typeof body.approve !== 'boolean') return send(400, { error: 'approve must be a boolean' }), true;
      if (!(await deps.accounts.resolveVerification(id, body.approve))) return send(404, { error: 'Nothing pending for this user' }), true;
      if (body.approve) deps.onVerifiedChanged?.(id, true);
      return send(200, { ok: true }), true;
    }

    // Take the badge away: { email }.
    if (req.method === 'POST' && resource === 'unverify' && deps.accounts) {
      const body = await readJson(req);
      const user = typeof body.email === 'string' ? await deps.accounts.userByEmail(body.email) : null;
      if (!user) return send(404, { error: 'No account with that email' }), true;
      await deps.accounts.revokeVerification(user.id);
      deps.onVerifiedChanged?.(user.id, false);
      return send(200, { ok: true }), true;
    }

    if (req.method === 'GET' && resource === 'bans') {
      return send(200, await store.listBans(url.searchParams.get('active') !== '0')), true;
    }

    if (req.method === 'POST' && resource === 'bans' && id && action === 'lift') {
      const ban = await store.liftBan(id);
      return ban ? send(200, ban) : send(404, { error: 'Ban not found' }), true;
    }

    if (req.method === 'GET' && resource === 'appeals') {
      const status = url.searchParams.get('status');
      const filter = status === 'open' || status === 'approved' || status === 'rejected' ? status : undefined;
      return send(200, await store.listAppeals(filter)), true;
    }

    if (req.method === 'POST' && resource === 'appeals' && id && action === 'resolve') {
      const body = await readJson(req);
      if (typeof body.approve !== 'boolean') return send(400, { error: 'approve must be a boolean' }), true;
      const appeal = await store.resolveAppeal(id, body.approve ? 'approved' : 'rejected');
      if (!appeal) return send(404, { error: 'Appeal not found' }), true;
      if (body.approve) await store.liftBan(appeal.banId);
      return send(200, appeal), true;
    }

    return send(404, { error: 'Not found' }), true;
  } catch (e) {
    console.error('[admin]', e);
    return send(e instanceof SyntaxError ? 400 : 500, { error: e instanceof SyntaxError ? 'Invalid JSON' : 'Server error' }), true;
  }
}
