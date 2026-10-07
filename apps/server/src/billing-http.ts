import type { IncomingMessage, ServerResponse } from 'node:http';
import { COIN_PACKS, PLUS_PLANS, type CoinPackId, type PlusPlan, type RazorpayProduct } from '@rc/shared';
import { isPlusActive, type AccountStore } from './accounts.ts';
import { applyBillingEvent, type BillingProvider } from './billing.ts';
import { applyPaidOrder, priceOf, type Razorpay } from './razorpay.ts';
import { bearer, cors, readJson, sendJson } from './http.ts';

const MAX_WEBHOOK_BODY = 1024 * 1024;

export interface BillingDeps {
  billing: BillingProvider | null;
  accounts: AccountStore;
  webUrl: string;
  origins: (string | RegExp)[];
  /** Called after a user's Plus status may have changed (to update live sessions). */
  onPlusChanged: (userId: string) => void;
  /** India: UPI / cards in rupees. */
  razorpay?: Razorpay | null;
}

async function readRaw(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_WEBHOOK_BODY) throw new Error('Webhook body too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export function createBillingHandler(deps: BillingDeps) {
  const { billing, accounts } = deps;

  return async function handleBilling(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://local');
    if (!url.pathname.startsWith('/billing/')) return false;
    const route = `${req.method} ${url.pathname}`;

    // Stripe calls this server-to-server: no CORS, raw body, signature check.
    if (route === 'POST /billing/webhook') {
      if (!billing) return sendJson(res, 503, { error: 'Billing is not configured' }), true;
      const signature = req.headers['stripe-signature'];
      let raw: Buffer;
      try {
        raw = await readRaw(req);
      } catch {
        return sendJson(res, 413, { error: 'Too large' }), true;
      }
      let event;
      try {
        event = billing.parseWebhook(raw, Array.isArray(signature) ? signature[0]! : (signature ?? ''));
      } catch {
        return sendJson(res, 400, { error: 'Invalid signature' }), true;
      }
      try {
        const userId = await applyBillingEvent(event, billing, accounts);
        if (userId) deps.onPlusChanged(userId);
        return sendJson(res, 200, { received: true }), true;
      } catch (e) {
        // A 500 makes Stripe retry the event later.
        console.error('[billing:webhook]', e);
        return sendJson(res, 500, { error: 'Processing failed' }), true;
      }
    }

    // Razorpay webhook (server-to-server): applies paid orders the browser didn't confirm.
    if (route === 'POST /billing/razorpay/webhook') {
      const rp = deps.razorpay;
      if (!rp) return sendJson(res, 503, { error: 'Razorpay is not configured' }), true;
      let raw: Buffer;
      try {
        raw = await readRaw(req);
      } catch {
        return sendJson(res, 413, { error: 'Too large' }), true;
      }
      const sig = req.headers['x-razorpay-signature'];
      if (!rp.verifyWebhook(raw, Array.isArray(sig) ? sig[0]! : (sig ?? ''))) return sendJson(res, 400, { error: 'Invalid signature' }), true;
      try {
        const event = JSON.parse(raw.toString('utf8')) as {
          event?: string;
          payload?: { order?: { entity?: { id: string; amount: number; notes: Record<string, string> } }; payment?: { entity?: { order_id?: string } } };
        };
        let order = event.event === 'order.paid' ? event.payload?.order?.entity : undefined;
        const orderId = event.event === 'payment.captured' ? event.payload?.payment?.entity?.order_id : undefined;
        if (!order && orderId) order = await rp.fetchOrder(orderId);
        if (order) {
          const userId = await applyPaidOrder(order, accounts);
          if (userId) deps.onPlusChanged(userId);
        }
        return sendJson(res, 200, { received: true }), true;
      } catch (e) {
        console.error('[razorpay:webhook]', e);
        return sendJson(res, 500, { error: 'Processing failed' }), true;
      }
    }

    if (cors(req, res, deps.origins)) return true;
    const fail = (status: number, error: string) => (sendJson(res, status, { error }), true);

    if (route === 'GET /billing/razorpay') {
      return sendJson(res, 200, deps.razorpay ? { enabled: true, keyId: deps.razorpay.cfg.keyId } : { enabled: false }), true;
    }

    try {
      if (route === 'GET /billing/plans') {
        if (!billing) return sendJson(res, 200, { enabled: false, plans: [] }), true;
        return sendJson(res, 200, { enabled: true, plans: await billing.listPrices() }), true;
      }

      const token = bearer(req);
      const user = token ? await accounts.useToken(token, 'session') : null;
      if (!user) return fail(401, 'Please log in');

      if (route === 'POST /billing/razorpay/order') {
        const rp = deps.razorpay;
        if (!rp) return fail(503, 'UPI payments are not set up yet');
        const { product } = await readJson(req);
        if (typeof product !== 'string' || !priceOf(product)) return fail(400, 'Unknown product');
        if (product.startsWith('plus:') && ['active', 'trialing', 'past_due'].includes(user.plus.status ?? '') && isPlusActive(user.plus)) {
          return fail(409, 'You already have a Plus subscription');
        }
        const order = await rp.createOrder(user.id, product as RazorpayProduct);
        return sendJson(res, 200, { orderId: order.id, amount: order.amount, currency: order.currency, keyId: rp.cfg.keyId }), true;
      }

      if (route === 'POST /billing/razorpay/verify') {
        const rp = deps.razorpay;
        if (!rp) return fail(503, 'UPI payments are not set up yet');
        const { orderId, paymentId, signature } = await readJson(req);
        if (typeof orderId !== 'string' || typeof paymentId !== 'string' || typeof signature !== 'string') return fail(400, 'Invalid request');
        if (!rp.verifyPayment(orderId, paymentId, signature)) return fail(400, 'Payment could not be verified');
        const order = await rp.fetchOrder(orderId);
        if (order.notes?.userId !== user.id) return fail(403, 'This payment belongs to another account');
        const applied = await applyPaidOrder(order, accounts);
        if (applied) deps.onPlusChanged(applied);
        return sendJson(res, 200, { ok: true }), true;
      }

      if (!billing) return fail(503, 'Payments are not set up yet');

      if (route === 'POST /billing/checkout') {
        const { plan } = await readJson(req);
        if (!PLUS_PLANS.includes(plan as PlusPlan)) return fail(400, 'Unknown plan');
        const customerId = await billing.ensureCustomer(user);
        if (customerId !== user.stripeCustomerId) await accounts.setStripeCustomer(user.id, customerId);
        const checkout = await billing.checkoutUrl(
          customerId,
          user,
          plan as PlusPlan,
          `${deps.webUrl}/plus?success=1`,
          `${deps.webUrl}/plus?canceled=1`,
        );
        return sendJson(res, 200, { url: checkout }), true;
      }

      if (route === 'POST /billing/coins') {
        const { pack } = await readJson(req);
        if (!COIN_PACKS.some((p) => p.id === pack)) return fail(400, 'Unknown coin pack');
        const customerId = await billing.ensureCustomer(user);
        if (customerId !== user.stripeCustomerId) await accounts.setStripeCustomer(user.id, customerId);
        const checkout = await billing.coinCheckoutUrl(customerId, user, pack as CoinPackId, `${deps.webUrl}/coins?success=1`, `${deps.webUrl}/coins?canceled=1`);
        return sendJson(res, 200, { url: checkout }), true;
      }

      if (route === 'POST /billing/portal') {
        if (!user.stripeCustomerId) return fail(400, 'No subscription to manage');
        return sendJson(res, 200, { url: await billing.portalUrl(user.stripeCustomerId, `${deps.webUrl}/settings`) }), true;
      }

      return fail(404, 'Not found');
    } catch (e) {
      if (e instanceof SyntaxError) return fail(400, 'Invalid request');
      console.error('[billing]', e);
      return fail(502, 'Payment provider error. Please try again.');
    }
  };
}
