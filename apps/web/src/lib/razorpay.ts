'use client';

import type { RazorpayProduct } from '@rc/shared';
import { api, API_URL } from './auth';

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
interface RazorpayCheckout {
  open(): void;
  on(event: 'payment.failed', cb: (e: { error?: { description?: string } }) => void): void;
}
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayCheckout;

let script: Promise<void> | null = null;
const loadCheckout = () =>
  (script ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => {
      script = null;
      reject(new Error('Could not load the payment window'));
    };
    document.head.appendChild(s);
  }));

/** Whether ₹ / UPI payments are available (server has Razorpay keys). */
export async function razorpayEnabled(): Promise<boolean> {
  try {
    const r = await fetch(`${API_URL}/billing/razorpay`);
    return ((await r.json()) as { enabled?: boolean }).enabled === true;
  } catch {
    return false;
  }
}

/**
 * Opens Razorpay Checkout (UPI, cards, wallets) for a product and confirms the
 * payment with the server. Resolves 'paid' or 'closed'; throws on failure.
 */
export async function payWithRazorpay(product: RazorpayProduct, token: string, prefill: { email?: string }, description: string): Promise<'paid' | 'closed'> {
  const [order] = await Promise.all([
    api<{ orderId: string; amount: number; currency: string; keyId: string }>('/billing/razorpay/order', { product }, token),
    loadCheckout(),
  ]);
  const Ctor = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
  if (!Ctor) throw new Error('Could not load the payment window');
  return new Promise((resolve, reject) => {
    const checkout = new Ctor({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: 'randomCall',
      description,
      prefill,
      theme: { color: '#2f7de1' },
      handler: (r: RazorpayResponse) => {
        api('/billing/razorpay/verify', { orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }, token)
          .then(() => resolve('paid'))
          .catch(reject);
      },
      modal: { ondismiss: () => resolve('closed') },
    });
    checkout.on('payment.failed', (e) => reject(new Error(e.error?.description ?? 'Payment failed')));
    checkout.open();
  });
}
