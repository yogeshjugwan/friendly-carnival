import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/countryPages';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/settings', '/auth/', '/r/', '/get-verified'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
