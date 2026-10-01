import type { IncomingMessage, ServerResponse } from 'node:http';

const MAX_BODY = 16 * 1024;

export const originAllowed = (origin: string | undefined, origins: (string | RegExp)[]) =>
  !!origin && origins.some((o) => (typeof o === 'string' ? o === origin : o.test(origin)));

/** CORS for the web app's origin. Returns true when the request was a preflight (already answered). */
export function cors(req: IncomingMessage, res: ServerResponse, origins: (string | RegExp)[]): boolean {
  const origin = req.headers.origin;
  if (originAllowed(origin, origins)) {
    res.setHeader('access-control-allow-origin', origin!);
    res.setHeader('vary', 'origin');
    res.setHeader('access-control-allow-headers', 'authorization, content-type');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return true;
  }
  return false;
}

export function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new SyntaxError('Body too large');
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

export const bearer = (req: IncomingMessage) => {
  const h = req.headers.authorization ?? '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
};

/** Fixed-window limiter keyed by e.g. IP hash. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 50_000) for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }
}
