import Stripe from 'stripe';
import { PLUS_PLANS, type PlanPrice, type PlusPlan } from '@rc/shared';
import { NO_PLUS, type AccountStore, type StoredPlus, type User } from './accounts.ts';

/** The pieces of a Stripe subscription we care about, provider-neutral. */
export interface SubscriptionInfo {
  id: string;
  customerId: string;
  userId: string | null;
  status: string;
  priceId: string | null;
  /** End of the current paid period, ms. */
  periodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}

export type BillingEvent =
  | { type: 'checkout.completed'; userId: string | null; customerId: string | null; subscriptionId: string | null }
  | { type: 'subscription.changed'; subscription: SubscriptionInfo }
  | { type: 'ignored'; name: string };

export interface BillingProvider {
  readonly prices: Record<PlusPlan, string>;
  listPrices(): Promise<PlanPrice[]>;
  ensureCustomer(user: User): Promise<string>;
  checkoutUrl(customerId: string, user: User, plan: PlusPlan, successUrl: string, cancelUrl: string): Promise<string>;
  portalUrl(customerId: string, returnUrl: string): Promise<string>;
  /** Verifies the signature and normalizes the event. Throws on a bad signature. */
  parseWebhook(rawBody: Buffer, signature: string): BillingEvent;
  getSubscription(id: string): Promise<SubscriptionInfo>;
}

export const planForPrice = (prices: Record<PlusPlan, string>, priceId: string | null): PlusPlan | null =>
  (PLUS_PLANS.find((p) => prices[p] === priceId) ?? null) as PlusPlan | null;

export function toStoredPlus(sub: SubscriptionInfo, prices: Record<PlusPlan, string>): StoredPlus {
  return {
    status: sub.status,
    plan: planForPrice(prices, sub.priceId),
    until: sub.periodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    subscriptionId: sub.id,
  };
}

/**
 * Applies a webhook event to the account. Returns the user id that changed.
 * Idempotent: Stripe may deliver the same event more than once.
 */
export async function applyBillingEvent(event: BillingEvent, billing: BillingProvider, accounts: AccountStore): Promise<string | null> {
  if (event.type === 'ignored') return null;

  if (event.type === 'checkout.completed') {
    if (!event.userId || !event.customerId) return null;
    const user = await accounts.userById(event.userId);
    if (!user) return null;
    await accounts.setStripeCustomer(user.id, event.customerId);
    if (event.subscriptionId) {
      const sub = await billing.getSubscription(event.subscriptionId);
      await accounts.setPlus(user.id, toStoredPlus(sub, billing.prices));
    }
    return user.id;
  }

  const sub = event.subscription;
  const user = (sub.userId ? await accounts.userById(sub.userId) : null) ?? (await accounts.userByStripeCustomer(sub.customerId));
  if (!user) return null;
  if (!user.stripeCustomerId) await accounts.setStripeCustomer(user.id, sub.customerId);
  // Ignore events for an older subscription once a newer one is on file.
  if (user.plus.subscriptionId && user.plus.subscriptionId !== sub.id && sub.status !== 'active' && sub.status !== 'trialing') {
    return null;
  }
  await accounts.setPlus(user.id, sub.status === 'canceled' ? { ...NO_PLUS, status: 'canceled', subscriptionId: sub.id } : toStoredPlus(sub, billing.prices));
  return user.id;
}

const subscriptionInfo = (s: Stripe.Subscription): SubscriptionInfo => {
  const item = s.items.data[0];
  return {
    id: s.id,
    customerId: typeof s.customer === 'string' ? s.customer : s.customer.id,
    userId: (s.metadata?.userId as string | undefined) ?? null,
    status: s.status,
    priceId: item?.price?.id ?? null,
    // Newer API versions keep the billing period on each item.
    periodEnd: item?.current_period_end ? item.current_period_end * 1000 : null,
    cancelAtPeriodEnd: s.cancel_at_period_end,
  };
};

export class StripeBilling implements BillingProvider {
  private stripe: Stripe;
  private priceCache: { at: number; prices: PlanPrice[] } | null = null;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
    readonly prices: Record<PlusPlan, string>,
  ) {
    this.stripe = new Stripe(secretKey);
  }

  async listPrices(): Promise<PlanPrice[]> {
    if (this.priceCache && Date.now() - this.priceCache.at < 10 * 60_000) return this.priceCache.prices;
    const prices = await Promise.all(
      PLUS_PLANS.map(async (plan) => {
        const p = await this.stripe.prices.retrieve(this.prices[plan]);
        return {
          plan,
          amount: p.unit_amount ?? 0,
          currency: p.currency,
          interval: (p.recurring?.interval === 'week' ? 'week' : 'month') as PlanPrice['interval'],
          intervalCount: p.recurring?.interval_count ?? 1,
        };
      }),
    );
    this.priceCache = { at: Date.now(), prices };
    return prices;
  }

  async ensureCustomer(user: User): Promise<string> {
    if (user.stripeCustomerId) return user.stripeCustomerId;
    const customer = await this.stripe.customers.create({ email: user.email, metadata: { userId: user.id } });
    return customer.id;
  }

  async checkoutUrl(customerId: string, user: User, plan: PlusPlan, successUrl: string, cancelUrl: string) {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: this.prices[plan], quantity: 1 }],
      subscription_data: { metadata: { userId: user.id, plan } },
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    if (!session.url) throw new Error('Stripe did not return a checkout URL');
    return session.url;
  }

  async portalUrl(customerId: string, returnUrl: string) {
    const session = await this.stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return session.url;
  }

  parseWebhook(rawBody: Buffer, signature: string): BillingEvent {
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    return normalizeStripeEvent(event);
  }

  async getSubscription(id: string) {
    return subscriptionInfo(await this.stripe.subscriptions.retrieve(id));
  }
}

export function normalizeStripeEvent(event: Stripe.Event): BillingEvent {
  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object;
      if (s.mode !== 'subscription') return { type: 'ignored', name: event.type };
      return {
        type: 'checkout.completed',
        userId: s.client_reference_id,
        customerId: typeof s.customer === 'string' ? s.customer : (s.customer?.id ?? null),
        subscriptionId: typeof s.subscription === 'string' ? s.subscription : (s.subscription?.id ?? null),
      };
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return { type: 'subscription.changed', subscription: subscriptionInfo(event.data.object) };
    default:
      return { type: 'ignored', name: event.type };
  }
}
