import type { RTCIceServerLike } from '@rc/shared';

// Trim values: a stray space or newline pasted into a dashboard breaks tokens and URLs.
const env: Record<string, string | undefined> = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => [k, v?.trim()]),
);

export const config = {
  port: Number(env.PORT ?? 4100),
  webOrigins: parseOrigins(env.WEB_ORIGIN ?? 'http://localhost:3000'),
  /** How many recent partners to avoid re-matching with. */
  recentPartnerMemory: 5,
  statsIntervalMs: 5_000,
  iceServers: buildIceServers(),
  /** Bearer token for /admin/*; admin is disabled when unset. */
  adminToken: env.ADMIN_TOKEN || undefined,
  /** Salt for hashing IPs before they are stored. Set a long random value in production. */
  ipSalt: env.IP_SALT || 'dev-only-salt',
  /** Postgres for reports, bans, blocks and appeals; in-memory when unset. */
  databaseUrl: env.DATABASE_URL || undefined,
  /** Daily matches for free users (0 turns the limit off) and the rewarded-video top-up. */
  limits: {
    daily: Number(env.FREE_DAILY_MATCHES ?? 30),
    adBonus: Number(env.REWARD_AD_MATCHES ?? 10),
    maxAds: Number(env.REWARD_ADS_PER_DAY ?? 5),
    adMs: Number(env.REWARD_AD_MS ?? 15_000),
  },
  /** Public URL of this server (Google redirects back here). Render sets RENDER_EXTERNAL_URL. */
  serverUrl: (env.SERVER_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${env.PORT ?? 4100}`).replace(/\/$/, ''),
  /** "Continue with Google"; disabled unless both are set. */
  google:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } : null,
  /** Public URL of the web app, used in email links. */
  webUrl: (env.WEB_URL || 'http://localhost:3000').replace(/\/$/, ''),
  /** https://resend.com API key; without it emails are printed to the log. */
  resendApiKey: env.RESEND_API_KEY || undefined,
  mailFrom: env.MAIL_FROM || 'randomCall <onboarding@resend.dev>',
  /** Stripe for Plus; billing is disabled unless the key, webhook secret and all 3 prices are set. */
  stripe:
    env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.STRIPE_PRICE_WEEK && env.STRIPE_PRICE_MONTH && env.STRIPE_PRICE_HALFYEAR
      ? {
          secretKey: env.STRIPE_SECRET_KEY,
          webhookSecret: env.STRIPE_WEBHOOK_SECRET,
          prices: { week: env.STRIPE_PRICE_WEEK, month: env.STRIPE_PRICE_MONTH, halfyear: env.STRIPE_PRICE_HALFYEAR },
        }
      : undefined,
};

/** `https://*.vercel.app` matches any subdomain; other entries must match exactly. */
export function parseOrigins(value: string): (string | RegExp)[] {
  return value
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => {
      const wildcard = o.match(/^(https?):\/\/\*\.(.+)$/);
      if (!wildcard) return o;
      const [, scheme, host] = wildcard;
      return new RegExp(`^${scheme}://[a-z0-9-]+\\.${host.replace(/\./g, '\\.')}$`, 'i');
    });
}

function buildIceServers(): RTCIceServerLike[] {
  const servers: RTCIceServerLike[] = [
    { urls: (env.STUN_URLS ?? 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302').split(',') },
  ];
  if (env.TURN_URLS && env.TURN_USERNAME && env.TURN_CREDENTIAL) {
    servers.push({
      urls: env.TURN_URLS.split(','),
      username: env.TURN_USERNAME,
      credential: env.TURN_CREDENTIAL,
    });
  }
  return servers;
}
