import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import { ApiClient } from '../lib/api-client.js';

export default defineCommand({
  meta: { name: 'show', description: 'show one connector by slug or id' },
  args: {
    target: { type: 'positional', description: 'slug or id', required: true },
    profile: { type: 'string', description: 'profile name', required: false },
    json: { type: 'boolean', description: 'emit raw JSON', default: false },
  },
  async run({ args }) {
    const profile = args.profile ?? 'default';
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClient({ baseUrl });
    const detail = await client.get(`/api/connectors/${encodeURIComponent(args.target)}`);
    console.log(JSON.stringify(detail, null, 2));
  },
});
