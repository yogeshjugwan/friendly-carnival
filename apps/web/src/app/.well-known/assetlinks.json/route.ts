/**
 * Digital Asset Links for the Android app (a Trusted Web Activity around this
 * site): proves the Play Store app and the website belong together, so the
 * app opens full-screen without a browser bar. Set ANDROID_PACKAGE_NAME and
 * ANDROID_CERT_SHA256 (comma-separated fingerprints; see docs/play-store.md).
 */
export const dynamic = 'force-dynamic';

export function GET() {
  const pkg = process.env.ANDROID_PACKAGE_NAME?.trim();
  const certs = (process.env.ANDROID_CERT_SHA256 ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const body =
    pkg && certs.length
      ? [
          {
            relation: ['delegate_permission/common.handle_all_urls'],
            target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: certs },
          },
        ]
      : [];
  return Response.json(body, { headers: { 'cache-control': 'public, max-age=3600' } });
}
