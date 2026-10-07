import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { INR_COIN_PRICES, PLUS_PASSES } from '@rc/shared';
import { isPlusActive, MemoryAccountStore, PostgresAccountStore } from './accounts.ts';
import { createApp } from './app.ts';
import { Razorpay } from './razorpay.ts';
import { MemoryStore } from './store.ts';

const cfg = { keyId: 'rzp_test_x', keySecret: 'key-secret', webhookSecret: 'hook-secret' };

/** A tiny fake of Razorpay's orders API. */
function fakeRazorpay() {
  const orders = new Map<string, { id: string; amount: number; currency: string; status: string; notes: Record<string, string> }>();
  let n = 0;
  const doFetch = (async (url: string, init?: RequestInit) => {
    if (url.endsWith('/v1/orders') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      const order = { id: `order_${++n}`, amount: body.amount, currency: body.currency, status: 'created', notes: body.notes };
      orders.set(order.id, order);
      return new Response(JSON.stringify(order), { status: 200 });
    }
    const id = decodeURIComponent(url.split('/').pop()!);
    const order = orders.get(id);
    return order ? new Response(JSON.stringify(order), { status: 200 }) : new Response('{}', { status: 404 });
  }) as typeof fetch;
  return { orders, client: new Razorpay(cfg, doFetch) };
}

test('Razorpay: order → signed payment → coins / Plus pass, applied exactly once', async () => {
  const accounts = new MemoryAccountStore();
  const rp = fakeRazorpay();
  const app = createApp({ store: new MemoryStore(), accounts, statsIntervalMs: 60_000, limits: null, razorpay: rp.client });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  const u = (await accounts.createUser('in@example.com', 'h')) as { id: string };
  const token = await accounts.createToken(u.id, 'session');
  const post = async (path: string, body: unknown, t = token) => {
    const res = await fetch(url + path, { method: 'POST', headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const sign = (orderId: string, paymentId: string) => createHmac('sha256', cfg.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  try {
    assert.deepEqual(await (await fetch(`${url}/billing/razorpay`)).json(), { enabled: true, keyId: 'rzp_test_x' });
    assert.equal((await post('/billing/razorpay/order', { product: 'coins:huge' })).status, 400);

    const order = await post('/billing/razorpay/order', { product: 'coins:medium' });
    assert.equal(order.status, 200);
    assert.equal(order.body.amount, INR_COIN_PRICES.medium);
    const orderId = order.body.orderId as string;

    assert.equal((await post('/billing/razorpay/verify', { orderId, paymentId: 'pay_1', signature: 'forged' })).status, 400);
    assert.equal((await post('/billing/razorpay/verify', { orderId, paymentId: 'pay_1', signature: sign(orderId, 'pay_1') })).status, 200);
    assert.equal((await accounts.userById(u.id))!.coins, 550);

    // The webhook for the same order changes nothing.
    const event = Buffer.from(JSON.stringify({ event: 'order.paid', payload: { order: { entity: rp.orders.get(orderId) } } }));
    const hook = (raw: Buffer, sig: string) =>
      fetch(`${url}/billing/razorpay/webhook`, { method: 'POST', headers: { 'x-razorpay-signature': sig, 'content-type': 'application/json' }, body: new Uint8Array(raw) });
    assert.equal((await hook(event, 'bad')).status, 400);
    assert.equal((await hook(event, createHmac('sha256', cfg.webhookSecret).update(event).digest('hex'))).status, 200);
    assert.equal((await accounts.userById(u.id))!.coins, 550, 'applied once');

    // A Plus pass, applied by the webhook alone (browser closed before verify).
    const pass = await post('/billing/razorpay/order', { product: 'plus:week' });
    const passOrder = rp.orders.get(pass.body.orderId as string)!;
    assert.equal(passOrder.amount, PLUS_PASSES[0]!.paise);
    const paid = Buffer.from(JSON.stringify({ event: 'order.paid', payload: { order: { entity: passOrder } } }));
    await hook(paid, createHmac('sha256', cfg.webhookSecret).update(paid).digest('hex'));
    const plus = (await accounts.userById(u.id))!.plus;
    assert.ok(isPlusActive(plus) && plus.status === 'pass' && plus.until! - Date.now() > 6.9 * 86_400_000);

    // Someone else's payment can't be claimed.
    const v = (await accounts.createUser('other@example.com', 'h')) as { id: string };
    const other = await accounts.createToken(v.id, 'session');
    const o2 = await post('/billing/razorpay/order', { product: 'coins:small' });
    const id2 = o2.body.orderId as string;
    assert.equal((await post('/billing/razorpay/verify', { orderId: id2, paymentId: 'pay_9', signature: sign(id2, 'pay_9') }, other)).status, 403);
  } finally {
    await app.close();
  }
});

test('Razorpay off: endpoints say so', async () => {
  const app = createApp({ store: new MemoryStore(), statsIntervalMs: 60_000, limits: null, razorpay: null });
  await new Promise<void>((r) => app.http.listen(0, r));
  const url = `http://localhost:${(app.http.address() as AddressInfo).port}`;
  try {
    assert.deepEqual(await (await fetch(`${url}/billing/razorpay`)).json(), { enabled: false });
  } finally {
    await app.close();
  }
});

test('payments ledger in Postgres (pg-mem)', async () => {
  const { newDb } = await import('pg-mem');
  const { Pool } = newDb().adapters.createPg();
  const accounts = new PostgresAccountStore(new Pool());
  await accounts.init();
  assert.equal(await accounts.recordPayment('razorpay:order_1', 'u', 'coins:small', 2900), true);
  assert.equal(await accounts.recordPayment('razorpay:order_1', 'u', 'coins:small', 2900), false);
});
