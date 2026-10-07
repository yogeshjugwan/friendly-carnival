import { createHmac, timingSafeEqual } from 'node:crypto';
import { COIN_PACKS, INR_COIN_PRICES, PLUS_PASSES, type RazorpayProduct } from '@rc/shared';
import { isPlusActive, NO_PLUS, type AccountStore } from './accounts.ts';

/**
 * Razorpay for India: one-time orders for coin packs and prepaid Plus passes,
 * paid by UPI, card or wallet in the Razorpay Checkout. A payment is applied
 * when the browser returns a signed payment (verify) or when Razorpay's
 * webhook says the order is paid — whichever comes first; the other is a no-op.
 */
export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

type Fetch = typeof fetch;

export const priceOf = (product: string): number | null => {
  const [kind, id] = product.split(':');
  if (kind === 'coins') return COIN_PACKS.some((p) => p.id === id) ? INR_COIN_PRICES[id as keyof typeof INR_COIN_PRICES] : null;
  if (kind === 'plus') return PLUS_PASSES.find((p) => p.plan === id)?.paise ?? null;
  return null;
};

const sameHmac = (expectedHex: string, given: string) => {
  const a = Buffer.from(expectedHex);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
};

export class Razorpay {
  constructor(
    readonly cfg: RazorpayConfig,
    private readonly doFetch: Fetch = fetch,
  ) {}

  private auth() {
    return `Basic ${Buffer.from(`${this.cfg.keyId}:${this.cfg.keySecret}`).toString('base64')}`;
  }

  async createOrder(userId: string, product: RazorpayProduct): Promise<{ id: string; amount: number; currency: string }> {
    const amount = priceOf(product);
    if (!amount) throw new Error('Unknown product');
    const res = await this.doFetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { authorization: this.auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ amount, currency: 'INR', receipt: `rc_${Date.now().toString(36)}`, notes: { userId, product } }),
    });
    if (!res.ok) throw new Error(`Razorpay order ${res.status}`);
    const order = (await res.json()) as { id: string; amount: number; currency: string };
    return { id: order.id, amount: order.amount, currency: order.currency };
  }

  /** The order as Razorpay has it (amount, status and the notes we set). */
  async fetchOrder(orderId: string): Promise<{ id: string; amount: number; status: string; notes: { userId?: string; product?: string } }> {
    const res = await this.doFetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`, { headers: { authorization: this.auth() } });
    if (!res.ok) throw new Error(`Razorpay fetch ${res.status}`);
    return (await res.json()) as { id: string; amount: number; status: string; notes: { userId?: string; product?: string } };
  }

  /** The signature Checkout returns: HMAC(order_id|payment_id, key secret). */
  verifyPayment(orderId: string, paymentId: string, signature: string): boolean {
    const expected = createHmac('sha256', this.cfg.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
    return sameHmac(expected, signature);
  }

  verifyWebhook(raw: Buffer, signature: string): boolean {
    const expected = createHmac('sha256', this.cfg.webhookSecret).update(raw).digest('hex');
    return sameHmac(expected, signature);
  }
}

/**
 * Credits a paid order exactly once. Returns the user id when something was
 * applied now, null when it had been applied before (or doesn't check out).
 */
export async function applyPaidOrder(
  order: { id: string; amount: number; notes: { userId?: string; product?: string } },
  accounts: AccountStore,
): Promise<string | null> {
  const { userId, product } = order.notes ?? {};
  if (!userId || !product) return null;
  const price = priceOf(product);
  if (!price || order.amount !== price) return null;
  const user = await accounts.userById(userId);
  if (!user) return null;
  if (!(await accounts.recordPayment(`razorpay:${order.id}`, userId, product, order.amount))) return null;

  const [kind, id] = product.split(':');
  if (kind === 'coins') {
    const pack = COIN_PACKS.find((p) => p.id === id)!;
    await accounts.changeCoins(userId, pack.coins, 'purchase', `razorpay:${order.id}`);
  } else {
    const pass = PLUS_PASSES.find((p) => p.plan === id)!;
    // Passes stack on an existing pass / gift; a paid subscription is left alone.
    const from = isPlusActive(user.plus) && (user.plus.status === 'pass' || user.plus.status === 'admin') && user.plus.until ? user.plus.until : Date.now();
    await accounts.setPlus(userId, { ...NO_PLUS, status: 'pass', plan: pass.plan, until: from + pass.days * 86_400_000 });
  }
  return userId;
}
