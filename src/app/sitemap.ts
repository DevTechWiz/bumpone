import type { MetadataRoute } from 'next';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const revalidate = 3600; // Cache sitemap for 1 hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  const baseUrl = (envUrl && !envUrl.includes('localhost')) ? envUrl : 'https://bumpone.lol';
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/refund`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];

  try {
    const { data: projects } = await supabaseAdmin
      .from('projects')
      .select('id, updated_at, created_at')
      .eq('is_active', true)
      .eq('moderation_status', 'approved')
      .order('current_active_value_minor', { ascending: false })
      .limit(100);

    const projectRoutes: MetadataRoute.Sitemap = (projects || []).map((project) => ({
      url: `${baseUrl}/project/${project.id}`,
      lastModified: project.updated_at
        ? new Date(project.updated_at)
        : project.created_at
        ? new Date(project.created_at)
        : now,
      changeFrequency: 'daily',
      priority: 0.8,
    }));

    return [...staticRoutes, ...projectRoutes];
  } catch (error) {
    console.warn('Failed to query dynamic projects for sitemap, falling back to static routes:', error);
    return staticRoutes;
  }
}
