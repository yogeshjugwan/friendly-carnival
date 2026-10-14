import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'randomCall — Random video chat',
    short_name: 'randomCall',
    description: 'Meet someone new in seconds. Free one-on-one random video chat.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    background_color: '#07080b',
    theme_color: '#07080b',
    categories: ['social', 'entertainment'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
