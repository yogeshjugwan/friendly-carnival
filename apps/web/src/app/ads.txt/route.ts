import { ADSENSE_CLIENT } from '@/lib/ads';

/** https://support.google.com/adsense/answer/12171612 — required for AdSense to pay out. */
export function GET() {
  const pub = ADSENSE_CLIENT.replace(/^ca-/, '');
  if (!pub) return new Response('# No ad networks configured\n', { headers: { 'content-type': 'text/plain' } });
  return new Response(`google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`, { headers: { 'content-type': 'text/plain' } });
}
