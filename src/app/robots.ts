import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://watamubookings.com';

// Private paths that should never be crawled.
const PRIVATE_PATHS = [
  '/admin',
  '/admin/',
  '/dashboard',
  '/dashboard/',
  '/api/',
  '/auth/',
  '/booking/',
  '/invoice/',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Default rule — standard search engines and fall-through.
      {
        userAgent: '*',
        allow: '/',
        disallow: PRIVATE_PATHS,
      },
      // AI search / training crawlers. Same privacy rules; we do want them
      // to read our public pages so we show up in ChatGPT Search,
      // Perplexity, Gemini, Claude etc.
      { userAgent: 'GPTBot', allow: '/', disallow: PRIVATE_PATHS },
      { userAgent: 'OAI-SearchBot', allow: '/', disallow: PRIVATE_PATHS },
      { userAgent: 'ChatGPT-User', allow: '/', disallow: PRIVATE_PATHS },
      { userAgent: 'PerplexityBot', allow: '/', disallow: PRIVATE_PATHS },
      { userAgent: 'Perplexity-User', allow: '/', disallow: PRIVATE_PATHS },
      { userAgent: 'Google-Extended', allow: '/', disallow: PRIVATE_PATHS },
      { userAgent: 'ClaudeBot', allow: '/', disallow: PRIVATE_PATHS },
      { userAgent: 'anthropic-ai', allow: '/', disallow: PRIVATE_PATHS },
      { userAgent: 'cohere-ai', allow: '/', disallow: PRIVATE_PATHS },
      { userAgent: 'Bytespider', allow: '/', disallow: PRIVATE_PATHS },
      { userAgent: 'Amazonbot', allow: '/', disallow: PRIVATE_PATHS },
      { userAgent: 'Applebot-Extended', allow: '/', disallow: PRIVATE_PATHS },
      { userAgent: 'FacebookBot', allow: '/', disallow: PRIVATE_PATHS },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
