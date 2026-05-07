import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Default OpenNext-Cloudflare config — in-memory incremental cache, no R2.
// Re-evaluate when first cold-start latency becomes annoying or when real
// content lands and the placeholder pages stop dominating the corpus.
export default defineCloudflareConfig();
