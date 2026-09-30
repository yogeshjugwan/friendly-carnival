import type { RTCIceServerLike } from '@rc/shared';

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 4100),
  webOrigins: parseOrigins(env.WEB_ORIGIN ?? 'http://localhost:3000'),
  /** How many recent partners to avoid re-matching with. */
  recentPartnerMemory: 5,
  statsIntervalMs: 5_000,
  iceServers: buildIceServers(),
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
