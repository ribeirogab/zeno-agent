import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import { ApiClient } from '../lib/api-client.js';
import { setQuiet } from '../lib/output.js';
import { resolveConnector, resolveProfile } from '../lib/resolvers.js';

export default defineCommand({
  meta: { name: 'show', description: 'show one connector by slug or id' },
  args: {
    target: { type: 'positional', description: 'slug or id', required: false },
    profile: { type: 'string', description: 'profile name', required: false },
    json: { type: 'boolean', description: 'emit raw JSON', default: false },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClient({ baseUrl });
    const slug = await resolveConnector(args.target as string | undefined, {
      listConnectors: () => client.get('/api/connectors'),
    });
    const detail = await client.get(`/api/connectors/${encodeURIComponent(slug)}`);
    if (args.json) {
      process.stdout.write(`${JSON.stringify(detail)}\n`);
      return;
    }
    console.log(JSON.stringify(detail, null, 2));
  },
});
