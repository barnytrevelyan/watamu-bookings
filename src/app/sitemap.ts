import type { MetadataRoute } from 'next';
import { createClient } from '@/lib/supabase/server';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://watamubookings.com';

export const revalidate = 3600; // rebuild hourly

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE_URL}/properties`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/boats`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/activities`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/map`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${BASE_URL}/tides`, lastModified: now, changeFrequency: 'daily', priority: 0.5 },
    { url: `${BASE_URL}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
  ];

  // Best-effort dynamic routes — silently fall back to static list if Supabase
  // is unreachable during build.
  try {
    const supabase = await createClient();

    const [{ data: properties }, { data: boats }] = await Promise.all([
      supabase
        .from('wb_properties')
        .select('slug, updated_at')
        .eq('is_published', true)
        .limit(500),
      supabase
        .from('wb_boats')
        .select('slug, updated_at')
        .eq('is_published', true)
        .limit(500),
    ]);

    const propertyRoutes: MetadataRoute.Sitemap =
      (properties ?? [])
        .filter((p: { slug: string | null }) => !!p.slug)
        .map((p: { slug: string; updated_at: string | null }) => ({
          url: `${BASE_URL}/properties/${p.slug}`,
          lastModified: p.updated_at ? new Date(p.updated_at) : now,
          changeFrequency: 'weekly' as const,
          priority: 0.8,
        }));

    const boatRoutes: MetadataRoute.Sitemap =
      (boats ?? [])
        .filter((b: { slug: string | null }) => !!b.slug)
        .map((b: { slug: string; updated_at: string | null }) => ({
          url: `${BASE_URL}/boats/${b.slug}`,
          lastModified: b.updated_at ? new Date(b.updated_at) : now,
          changeFrequency: 'weekly' as const,
          priority: 0.8,
        }));

    return [...staticRoutes, ...propertyRoutes, ...boatRoutes];
  } catch {
    return staticRoutes;
  }
}
