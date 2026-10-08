import type { MetadataRoute } from 'next';
import { COUNTRY_PAGES, SITE_URL } from '@/lib/countryPages';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages = ['', '/rooms', '/plus', '/coins', '/invite', '/help', '/guidelines', '/terms', '/privacy'];
  return [
    ...pages.map((p) => ({ url: `${SITE_URL}${p}`, lastModified: now, changeFrequency: 'weekly' as const, priority: p === '' ? 1 : 0.5 })),
    ...COUNTRY_PAGES.map((c) => ({ url: `${SITE_URL}/chat/${c.slug}`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.7 })),
  ];
}
