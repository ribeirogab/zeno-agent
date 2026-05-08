import type { MetadataRoute } from 'next';
import { source } from '@/lib/source';

const SITE_URL = 'https://docs.zeno-agent.dev';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return source.getPages().map((page) => ({
    url: `${SITE_URL}${page.url}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: page.url === '/' ? 1.0 : 0.7,
  }));
}
