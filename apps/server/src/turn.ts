import type { RTCIceServerLike } from '@rc/shared';

/**
 * TURN relays the ~15–20% of calls that can't connect directly (strict mobile
 * and office NATs). Instead of a long-lived TURN password, the server asks a
 * TURN provider for short-lived credentials and refreshes them in the
 * background:
 *
 *   Cloudflare:  CF_TURN_KEY_ID + CF_TURN_API_TOKEN
 *   Metered:     METERED_DOMAIN (e.g. myapp.metered.live) + METERED_API_KEY
 *
 * Static TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL still work as a fallback.
 */

export interface TurnConfig {
  cloudflare?: { keyId: string; apiToken: string } | null;
  metered?: { domain: string; apiKey: string } | null;
}

const TTL_S = 24 * 60 * 60;
const REFRESH_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;

type Fetch = typeof fetch;

const asList = (v: unknown): RTCIceServerLike[] => {
  const list = Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : [];
  return list.filter((s): s is RTCIceServerLike => !!s && typeof s === 'object' && 'urls' in s);
};

async function fromCloudflare(cfg: { keyId: string; apiToken: string }, doFetch: Fetch): Promise<RTCIceServerLike[]> {
  const res = await doFetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(cfg.keyId)}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.apiToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ttl: TTL_S }),
  });
  if (!res.ok) throw new Error(`Cloudflare TURN ${res.status}`);
  const body = (await res.json()) as { iceServers?: unknown };
  return asList(body.iceServers);
}

async function fromMetered(cfg: { domain: string; apiKey: string }, doFetch: Fetch): Promise<RTCIceServerLike[]> {
  const domain = cfg.domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const res = await doFetch(`https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(cfg.apiKey)}`);
  if (!res.ok) throw new Error(`Metered TURN ${res.status}`);
  return asList(await res.json());
}

export class TurnCredentials {
  private dynamic: RTCIceServerLike[] = [];
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  /** Last error, for /health (no secrets). */
  lastError: string | null = null;

  constructor(
    private readonly base: RTCIceServerLike[],
    private readonly cfg: TurnConfig,
    private readonly doFetch: Fetch = fetch,
  ) {}

  get enabled() {
    return !!(this.cfg.cloudflare || this.cfg.metered);
  }

  /** ICE servers for a new call: STUN + (fresh) TURN. */
  current(): RTCIceServerLike[] {
    return this.dynamic.length ? [...this.base.filter((s) => !s.username), ...this.dynamic] : this.base;
  }

  hasTurn() {
    return this.current().some((s) => !!s.username);
  }

  /** Fetches now, then keeps refreshing until stop(). */
  async start() {
    if (!this.enabled) return;
    await this.refresh();
  }

  async refresh() {
    if (this.stopped) return;
    let next = RETRY_MS;
    try {
      const servers = this.cfg.cloudflare
        ? await fromCloudflare(this.cfg.cloudflare, this.doFetch)
        : await fromMetered(this.cfg.metered!, this.doFetch);
      if (servers.some((s) => s.username)) {
        this.dynamic = servers;
        this.lastError = null;
        next = REFRESH_MS;
      } else {
        this.lastError = 'provider returned no TURN servers';
      }
    } catch (e) {
      // Keep the previous credentials (still valid for up to 24 h).
      this.lastError = e instanceof Error ? e.message : 'TURN fetch failed';
      console.error('[turn]', this.lastError);
    }
    if (!this.stopped) {
      this.timer = setTimeout(() => void this.refresh(), next);
      this.timer.unref?.();
    }
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
