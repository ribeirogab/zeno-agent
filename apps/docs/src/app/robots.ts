import type { MetadataRoute } from 'next';

const SITE_URL = 'https://docs.zeno-agent.dev';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
