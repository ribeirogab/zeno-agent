import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';

/**
 * OpenNext-Cloudflare config.
 *
 * R2 incremental cache backs ISR/SSG cache reads so cold reads do not
 * regenerate per request. The bucket is bound under `NEXT_INC_CACHE_R2_BUCKET`
 * in wrangler.jsonc; the binding name is fixed by the OpenNext-Cloudflare
 * convention (see `BINDING_NAME` in the package).
 *
 * Bucket creation is a one-time operational step:
 *   wrangler r2 bucket create zeno-docs-isr-cache
 */
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});
