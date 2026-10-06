import webpush from 'web-push';
import type { PushPayload, PushSubscriptionJSON } from '@rc/shared';
import type { AccountStore } from './accounts.ts';

export type PushSender = (sub: PushSubscriptionJSON, body: string, keys: VapidKeys) => Promise<unknown>;
interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

const defaultSender: PushSender = (sub, body, keys) =>
  webpush.sendNotification(sub, body, {
    TTL: 60 * 60,
    vapidDetails: { subject: keys.subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
  });

/**
 * Web Push for logged-in users (friend online, verification, invite rewards).
 * The VAPID key pair comes from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, or is
 * generated once and kept in the database, so it survives deploys.
 */
export class PushService {
  private keys: VapidKeys | null = null;
  private readonly ready: Promise<void>;

  constructor(
    private readonly accounts: AccountStore,
    subjectUrl: string,
    private readonly sender: PushSender = defaultSender,
  ) {
    // The push service wants an https URL or a mailto: to contact.
    const subject = subjectUrl.startsWith('https://') ? subjectUrl : 'mailto:push@randomcall.invalid';
    this.ready = this.loadKeys(subject).catch((e) => console.error('[push] keys', e));
  }

  private async loadKeys(subject: string) {
    const envPublic = process.env.VAPID_PUBLIC_KEY?.trim();
    const envPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
    if (envPublic && envPrivate) {
      this.keys = { publicKey: envPublic, privateKey: envPrivate, subject };
      return;
    }
    const stored = (await this.accounts.appSecret('vapid')) ?? (await this.accounts.initAppSecret('vapid', JSON.stringify(webpush.generateVAPIDKeys())));
    const { publicKey, privateKey } = JSON.parse(stored) as { publicKey: string; privateKey: string };
    this.keys = { publicKey, privateKey, subject };
  }

  async publicKey(): Promise<string | null> {
    await this.ready;
    return this.keys?.publicKey ?? null;
  }

  /** Sends to every device the user turned notifications on for. Returns how many got it. */
  async send(userId: string, payload: PushPayload): Promise<number> {
    await this.ready;
    if (!this.keys) return 0;
    const subs = await this.accounts.pushSubscriptions(userId);
    const body = JSON.stringify(payload);
    let sent = 0;
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await this.sender(sub, body, this.keys!);
          sent++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          // Gone or invalid: the browser unsubscribed.
          if (status === 404 || status === 410) await this.accounts.removePushSubscription(sub.endpoint).catch(() => undefined);
          else console.error('[push]', status ?? e);
        }
      }),
    );
    return sent;
  }
}

export const isPushSubscription = (v: unknown): v is PushSubscriptionJSON => {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  const keys = s.keys as Record<string, unknown> | undefined;
  return (
    typeof s.endpoint === 'string' &&
    s.endpoint.startsWith('https://') &&
    s.endpoint.length <= 1000 &&
    !!keys &&
    typeof keys.p256dh === 'string' &&
    keys.p256dh.length <= 200 &&
    typeof keys.auth === 'string' &&
    keys.auth.length <= 100
  );
};
