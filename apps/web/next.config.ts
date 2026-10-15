import type { NextConfig } from 'next';

/** Signalling / API server (Socket.IO + HTTP). */
const API = (process.env.NEXT_PUBLIC_SIGNALING_URL ?? 'http://localhost:4100').replace(/\/$/, '');
const API_WS = API.replace(/^http/, 'ws');
const dev = process.env.NODE_ENV !== 'production';

/**
 * Content-Security-Policy, sent as Report-Only first so nothing breaks while we
 * watch the browser console for violations. Origins come from what the code
 * actually loads:
 * - MediaPipe wasm (cdn.jsdelivr.net) + models (storage.googleapis.com)
 * - AdSense / Google Publisher Tag (googlesyndication / doubleclick / google)
 * - Razorpay Checkout (checkout.razorpay.com, api.razorpay.com)
 * - Stripe Checkout / Billing portal and Google sign-in are full-page redirects
 *   (via the API server), listed under form-action / frame-src for safety.
 * Next.js inline bootstrap scripts need 'unsafe-inline' until nonces are added.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ''} https://cdn.jsdelivr.net https://pagead2.googlesyndication.com https://securepubads.g.doubleclick.net https://*.googlesyndication.com https://*.doubleclick.net https://www.googletagservices.com https://adservice.google.com https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: data:",
  `connect-src 'self' ${API} ${API_WS} https://cdn.jsdelivr.net https://storage.googleapis.com https://*.googlesyndication.com https://*.doubleclick.net https://*.google.com https://api.razorpay.com https://lumberjack.razorpay.com`,
  "worker-src 'self' blob:",
  'frame-src https://*.doubleclick.net https://*.googlesyndication.com https://www.google.com https://api.razorpay.com https://checkout.razorpay.com https://js.stripe.com https://checkout.stripe.com',
  `form-action 'self' ${API} https://checkout.stripe.com https://billing.stripe.com https://accounts.google.com`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  transpilePackages: ['@rc/shared'],
  // The dev-mode "N" badge sat on top of the first call button and the Chat tab.
  devIndicators: false,
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'Content-Security-Policy-Report-Only', value: csp }] }];
  },
};

export default nextConfig;
