import { describe, test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import Stripe from 'stripe';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, MatchFound, PlanPrice, PlusPlan, ServerToClientEvents } from '@rc/shared';
import { MemoryAccountStore, type User } from './accounts.ts';
import { createApp, type App } from './app.ts';
import { StripeBilling, type BillingEvent, type BillingProvider, type SubscriptionInfo } from './billing.ts';
import { Matchmaker } from './matchmaker.ts';
import { MemoryStore } from './store.ts';

const PRICES: Record<PlusPlan, string> = { week: 'price_week', month: 'price_month', halfyear: 'price_half' };
const WEBHOOK_SECRET = 'whsec_test_secret';

describe('matchmaker filters', () => {
  const setup = () => new Matchmaker(5);

  test('a Plus female filter only matches women, and only Plus users can filter', () => {
    const mm = setup();
    mm.connect('plus', 'IN', { plus: true });
    mm.connect('man', 'IN');
    mm.connect('woman', 'US');
    mm.connect('free', 'IN');
    assert.equal(mm.join('plus', 'male', [], 'video', false, { gender: 'female', country: 'any' }), null);
    assert.equal(mm.join('man', 'male', [], 'video'), null, 'a man is not matched to the female-only Plus user');
    assert.equal(mm.join('woman', 'female', [], 'video')?.a.id, 'plus');
    // A free user's filters are ignored (they would otherwise only want women).
    const p = mm.join('free', 'male', [], 'video', false, { gender: 'female', country: 'any' });
    assert.equal(p?.a.id, 'man');
  });

  test('country filters match on country, never on hidden-country users, both ways', () => {
    const mm = setup();
    mm.connect('seeker', 'US', { plus: true });
    mm.connect('hidden-in', 'IN');
    mm.connect('in', 'IN');
    mm.join('seeker', 'male', [], 'video', false, { gender: 'any', country: 'IN' });
    assert.equal(mm.join('hidden-in', 'female', [], 'video', true), null, 'hidden country is never used for filtering');
    assert.equal(mm.join('in', 'female', [], 'video')?.a.id, 'seeker');

    // Two-way: B (Plus, wants US) is not matched with an Indian user.
    const mm2 = setup();
    mm2.connect('b', 'IN', { plus: true });
    mm2.connect('c', 'IN');
    mm2.join('b', 'male', [], 'video', false, { gender: 'any', country: 'US' });
    assert.equal(mm2.join('c', 'male', [], 'video'), null);
  });

  test('losing Plus clears filters', () => {
    const mm = setup();
    mm.connect('u', 'IN', { userId: 'acct', plus: true });
    mm.join('u', 'male', [], 'video', false, { gender: 'female', country: 'any' });
    mm.setPlus('acct', false);
    assert.deepEqual(mm.get('u')?.filters, { gender: 'any', country: 'any' });
  });
});

/** Stripe-shaped subscription object for signed webhook payloads. */
const stripeSubscription = (o: { id: string; customer: string; userId?: string; status: string; price: string; periodEnd: number; cancel?: boolean }) => ({
  id: o.id,
  object: 'subscription',
  customer: o.customer,
  status: o.status,
  cancel_at_period_end: o.cancel ?? false,
  metadata: o.userId ? { userId: o.userId } : {},
  items: { object: 'list', data: [{ id: 'si_1', object: 'subscription_item', price: { id: o.price }, current_period_end: o.periodEnd }] },
});

const signed = (type: string, object: unknown) => {
  const payload = JSON.stringify({ id: `evt_${randomUUID()}`, object: 'event', type, data: { object } });
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return { payload, header };
};

/** Real webhook parsing (StripeBilling) with the network calls faked. */
class FakeBilling implements BillingProvider {
  readonly prices = PRICES;
  subs = new Map<string, SubscriptionInfo>();
  private real = new StripeBilling('sk_test_offline', WEBHOOK_SECRET, PRICES);
  checkouts: { customerId: string; plan: PlusPlan }[] = [];

  async listPrices(): Promise<PlanPrice[]> {
    return [
      { plan: 'week', amount: 799, currency: 'usd', interval: 'week', intervalCount: 1 },
      { plan: 'month', amount: 1999, currency: 'usd', interval: 'month', intervalCount: 1 },
      { plan: 'halfyear', amount: 8999, currency: 'usd', interval: 'month', intervalCount: 6 },
    ];
  }
  async ensureCustomer(user: User) {
    return user.stripeCustomerId ?? `cus_${user.id.slice(0, 8)}`;
  }
  async checkoutUrl(customerId: string, _user: User, plan: PlusPlan) {
    this.checkouts.push({ customerId, plan });
    return `https://checkout.stripe.test/${plan}`;
  }
  async portalUrl(customerId: string) {
    return `https://billing.stripe.test/${customerId}`;
  }
  async coinCheckoutUrl(_customerId: string, _user: User, pack: string) {
    return `https://checkout.stripe.test/coins-${pack}`;
  }
  parseWebhook(raw: Buffer, signature: string): BillingEvent {
    return this.real.parseWebhook(raw, signature);
  }
  async getSubscription(id: string) {
    const s = this.subs.get(id);
    if (!s) throw new Error('no such subscription');
    return s;
  }
}

describe('Plus over HTTP and sockets', () => {
  let app: App;
  let url: string;
  const billing = new FakeBilling();
  const accounts = new MemoryAccountStore();
  const sockets: Socket[] = [];

  before(async () => {
    app = createApp({ statsIntervalMs: 60_000, store: new MemoryStore(), accounts, billing, adminToken: 'adm', webUrl: 'https://rc.test' });
    await new Promise<void>((r) => app.http.listen(0, r));
    url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  });
  after(async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
  });

  const post = (path: string, body: unknown, token?: string, headers: Record<string, string> = {}) =>
    fetch(url + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  const me = async (token: string) => (await fetch(url + '/auth/me', { headers: { authorization: `Bearer ${token}` } })).json();
  const signup = async () => {
    const email = `p-${randomUUID().slice(0, 8)}@example.com`;
    const { token, user } = await (await post('/auth/signup', { email, password: 'plus password' })).json();
    return { email, token: token as string, userId: user.id as string };
  };

  test('plans are public; checkout needs login and a known plan', async () => {
    const plans = await (await fetch(url + '/billing/plans')).json();
    assert.equal(plans.enabled, true);
    assert.deepEqual(plans.plans.map((p: PlanPrice) => p.plan), ['week', 'month', 'halfyear']);
    assert.equal((await post('/billing/checkout', { plan: 'month' })).status, 401);
    const { token } = await signup();
    assert.equal((await post('/billing/checkout', { plan: 'forever' }, token)).status, 400);
    const res = await post('/billing/checkout', { plan: 'halfyear' }, token);
    assert.deepEqual(await res.json(), { url: 'https://checkout.stripe.test/halfyear' });
    assert.equal((await post('/billing/portal', {}, token)).status, 200, 'customer was saved at checkout');
  });

  test('coin packs: checkout needs login; a paid checkout credits coins exactly once', async () => {
    assert.equal((await post('/billing/coins', { pack: 'small' })).status, 401);
    const { token, userId } = await signup();
    assert.equal((await post('/billing/coins', { pack: 'huge' }, token)).status, 400);
    assert.deepEqual(await (await post('/billing/coins', { pack: 'medium' }, token)).json(), { url: 'https://checkout.stripe.test/coins-medium' });
    assert.equal((await me(token)).wallet.coins, 0);

    const paid = signed('checkout.session.completed', {
      id: 'cs_coins_1',
      object: 'checkout.session',
      mode: 'payment',
      payment_status: 'paid',
      client_reference_id: userId,
      metadata: { kind: 'coins', userId, coins: '550', pack: 'medium' },
    });
    for (let i = 0; i < 2; i++) {
      // Stripe can deliver the same event twice.
      assert.equal((await post('/billing/webhook', paid.payload, undefined, { 'stripe-signature': paid.header })).status, 200);
    }
    assert.equal((await me(token)).wallet.coins, 550, 'credited once');

    const unpaid = signed('checkout.session.completed', {
      id: 'cs_coins_2',
      object: 'checkout.session',
      mode: 'payment',
      payment_status: 'unpaid',
      metadata: { kind: 'coins', userId, coins: '100' },
    });
    await post('/billing/webhook', unpaid.payload, undefined, { 'stripe-signature': unpaid.header });
    assert.equal((await me(token)).wallet.coins, 550, 'unpaid checkouts add nothing');
  });

  test('signed webhooks turn Plus on, keep it through cancel-at-period-end, and off on deletion', async () => {
    const { token, userId } = await signup();
    assert.equal((await me(token)).plus.active, false);

    const bad = signed('customer.subscription.updated', {});
    assert.equal((await post('/billing/webhook', bad.payload, undefined, { 'stripe-signature': 't=1,v1=forged' })).status, 400);

    const customer = `cus_${userId.slice(0, 8)}`;
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86_400;
    billing.subs.set('sub_1', { id: 'sub_1', customerId: customer, userId, status: 'active', priceId: 'price_month', periodEnd: periodEnd * 1000, cancelAtPeriodEnd: false });
    const done = signed('checkout.session.completed', { id: 'cs_1', object: 'checkout.session', mode: 'subscription', client_reference_id: userId, customer, subscription: 'sub_1' });
    const r1 = await post('/billing/webhook', done.payload, undefined, { 'stripe-signature': done.header });
    assert.equal(r1.status, 200);
    let plus = (await me(token)).plus;
    assert.equal(plus.active, true);
    assert.equal(plus.plan, 'month');
    assert.equal(plus.until, periodEnd * 1000);

    const cancel = signed('customer.subscription.updated', stripeSubscription({ id: 'sub_1', customer, status: 'active', price: 'price_month', periodEnd, cancel: true }));
    await post('/billing/webhook', cancel.payload, undefined, { 'stripe-signature': cancel.header });
    plus = (await me(token)).plus;
    assert.equal(plus.active, true, 'still Plus until the period ends');
    assert.equal(plus.cancelAtPeriodEnd, true);

    // Replaying the same event is harmless.
    await post('/billing/webhook', cancel.payload, undefined, { 'stripe-signature': cancel.header });

    const deleted = signed('customer.subscription.deleted', stripeSubscription({ id: 'sub_1', customer, status: 'canceled', price: 'price_month', periodEnd }));
    await post('/billing/webhook', deleted.payload, undefined, { 'stripe-signature': deleted.header });
    assert.equal((await me(token)).plus.active, false);
  });

  test('filters work only with Plus: free users get plus:required, Plus users get filtered matches', async () => {
    type C = Socket<ServerToClientEvents, ClientToServerEvents>;
    const sock = async (auth: object): Promise<C> => {
      const c: C = connect(url, { transports: ['websocket'], forceNew: true, auth: { deviceId: randomUUID(), ...auth } });
      sockets.push(c);
      await new Promise<void>((r) => c.once('connect', () => r()));
      return c;
    };
    const once = <E extends keyof ServerToClientEvents>(c: C, e: E) =>
      new Promise<Parameters<ServerToClientEvents[E]>[0]>((r) => c.once(e, ((x: never) => r(x)) as never));
    const femaleOnly = { gender: 'female' as const, country: 'any' };

    const free = await sock({});
    const required = once(free, 'plus:required');
    free.emit('queue:join', { gender: 'male', interests: [], mode: 'text', filters: femaleOnly });
    await required;
    free.emit('queue:leave');

    // Grant complimentary Plus through the admin API, then reconnect.
    const { email, token } = await signup();
    const grant = await post('/admin/plus', { email, days: 7 }, 'adm');
    assert.equal(grant.status, 200);
    assert.equal((await me(token)).plus.active, true);

    const plusUser = await sock({ token });
    const waiting = once(plusUser, 'queue:waiting');
    plusUser.emit('queue:join', { gender: 'male', interests: [], mode: 'video', filters: femaleOnly });
    await waiting;

    const man = await sock({});
    const manWaits = once(man, 'queue:waiting');
    man.emit('queue:join', { gender: 'male', interests: [], mode: 'video' });
    await manWaits;

    const woman = await sock({});
    const seen = once(woman, 'match:found');
    woman.emit('queue:join', { gender: 'female', interests: [], mode: 'video' });
    const match = (await seen) as MatchFound;
    assert.equal(match.partner.plus, true, 'partners see the Plus badge');
    assert.equal(app.matchmaker.partnerOf(plusUser.id!)?.id, woman.id);
    assert.equal(app.matchmaker.isWaiting(man.id!), true, 'the man is still waiting');

    // Revoking Plus takes effect on the live session.
    await post('/admin/plus', { email, days: 0 }, 'adm');
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(app.matchmaker.get(plusUser.id!)?.plus, false);
  });
});
