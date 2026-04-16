import { serve } from '@hono/node-server';
import { createLogger } from '@zeno/logger';
import { loadApiConfig } from '@/config';
import { createApp } from '@/server';

const logger = createLogger({ service: 'api' });

function main(): void {
  const config = loadApiConfig();
  logger.info({ event: 'api_boot_start' }, 'api booting');
  const app = createApp({ config });
  serve({ fetch: app.fetch, port: config.port }, (info) => {
    logger.info({ event: 'api_listening', port: info.port }, `api listening on :${info.port}`);
  });
}

main();
