/**
 * Small structured logger. Every line is `[scope] {json}`; values are redacted
 * so emails, tokens, links and auth headers never reach the logs (errors from
 * handshakes and webhooks can carry request data).
 */

type Level = 'error' | 'warn' | 'info';

const SECRET_KEY = /^(authorization|cookie|set-cookie|token|access_?token|refresh_?token|password|secret|api_?key|x-razorpay-signature|stripe-signature|email)$/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const LINK = /\b(?:https?|wss?):\/\/[^\s"'<>]+/gi;
/** Long opaque strings (session tokens, API keys, JWTs). */
const TOKEN = /\b[A-Za-z0-9_-]{32,}(?:\.[A-Za-z0-9_-]+){0,2}\b/g;

/** Redacts emails, bearer credentials, links and long tokens in a string. */
export function redactText(text: string): string {
  return text.replace(BEARER, '$1 [token]').replace(EMAIL, '[email]').replace(LINK, '[link]').replace(TOKEN, '[token]');
}

/** A JSON-safe, redacted copy of `value` (errors keep name, message, code and a redacted stack). */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactText(value);
  if (value === null || typeof value !== 'object') return typeof value === 'bigint' ? String(value) : value;
  if (depth > 4) return '[…]';
  if (value instanceof Error) {
    const e = value as Error & { code?: unknown; status?: unknown; statusCode?: unknown };
    const out: Record<string, unknown> = { name: e.name, message: redactText(e.message) };
    if (e.code !== undefined) out.code = redact(e.code, depth + 1);
    const status = e.status ?? e.statusCode;
    if (status !== undefined) out.status = redact(status, depth + 1);
    if (e.stack) out.stack = redactText(e.stack.split('\n').slice(0, 6).join('\n'));
    return out;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value).slice(0, 40)) out[k] = SECRET_KEY.test(k) ? '[redacted]' : redact(v, depth + 1);
  return out;
}

/** Where lines go (tests swap it). */
export const logSink = {
  write: (level: Level, line: string) => (level === 'error' ? console.error(line) : level === 'warn' ? console.warn(line) : console.log(line)),
};

function emit(level: Level, scope: string, msgOrErr: unknown, extra?: Record<string, unknown>) {
  const body: Record<string, unknown> = { level, at: new Date().toISOString() };
  if (typeof msgOrErr === 'string') body.msg = redactText(msgOrErr);
  else if (msgOrErr !== undefined) body.err = redact(msgOrErr);
  if (extra) Object.assign(body, redact(extra) as Record<string, unknown>);
  logSink.write(level, `[${scope}] ${JSON.stringify(body)}`);
}

export const log = {
  error: (scope: string, err: unknown, extra?: Record<string, unknown>) => emit('error', scope, err, extra),
  warn: (scope: string, msg: unknown, extra?: Record<string, unknown>) => emit('warn', scope, msg, extra),
  info: (scope: string, msg: string, extra?: Record<string, unknown>) => emit('info', scope, msg, extra),
};
