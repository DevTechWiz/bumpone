import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  const baseUrl = (envUrl && !envUrl.includes('localhost')) ? envUrl : 'https://bumpone.lol';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/admin/*',
          '/api/*',
          '/auth/*',
          '/profile',
          '/profile/*',
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: [
          '/admin',
          '/admin/*',
          '/api/*',
          '/auth/*',
          '/profile',
          '/profile/*',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
