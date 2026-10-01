import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Safety } from './safety.ts';
import type { SafetyStore } from './store.ts';

const HOUR = 3_600_000;
const MAX_BODY = 16 * 1024;

export interface AdminDeps {
  store: SafetyStore;
  safety: Safety;
  token: string | undefined;
  origins: (string | RegExp)[];
  online: () => number;
}

const allowed = (origin: string | undefined, origins: (string | RegExp)[]) =>
  !!origin && origins.some((o) => (typeof o === 'string' ? o === origin : o.test(origin)));

const sameToken = (given: string, expected: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  return parsed && typeof parsed === 'object' ? parsed : {};
}

/** Handles /admin/* requests. Returns false when the URL is not an admin route. */
export async function handleAdmin(req: IncomingMessage, res: ServerResponse, deps: AdminDeps): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://local');
  if (!url.pathname.startsWith('/admin/')) return false;

  const origin = req.headers.origin;
  if (allowed(origin, deps.origins)) {
    res.setHeader('access-control-allow-origin', origin!);
    res.setHeader('vary', 'origin');
    res.setHeader('access-control-allow-headers', 'authorization, content-type');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return true;
  }

  const send = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  if (!deps.token) return send(503, { error: 'Admin is disabled: set ADMIN_TOKEN on the server' }), true;
  const auth = req.headers.authorization ?? '';
  if (!auth.startsWith('Bearer ') || !sameToken(auth.slice(7), deps.token)) return send(401, { error: 'Unauthorized' }), true;

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
        const ban = await safety.ban({ deviceId: report.targetDevice, ipHash: report.targetIpHash }, durationMs, reason, 'admin', {
          includeIp,
        });
        await store.resolveReport(id, 'actioned', `banned ${hours === null ? 'permanently' : `${hours} h`}${includeIp ? ' + IP' : ''}`);
        return send(200, ban), true;
      }
      return send(400, { error: 'action must be "ban" or "dismiss"' }), true;
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
