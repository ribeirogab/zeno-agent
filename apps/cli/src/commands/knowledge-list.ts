import { existsSync } from 'node:fs';
import { scanKnowledge } from '@zeno/knowledge';
import { defineCommand } from 'citty';
import { c, err, setQuiet } from '../lib/output.js';
import { knowledgeDir } from '../lib/paths.js';
import { requireProfile } from '../lib/profile.js';
import { resolveProfile } from '../lib/resolvers.js';
import { db } from '../lib/state.js';

export default defineCommand({
  meta: { name: 'list', description: 'list knowledge files in a profile' },
  args: {
    profile: { type: 'positional', description: 'profile identifier', required: false },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const conn = db();
    const { name } = await resolveProfile(args.profile as string | undefined, {
      ignoreSticky: true,
    });
    requireProfile(conn, name);

    const dir = knowledgeDir(name);
    if (!existsSync(dir)) {
      console.error(err(`profile '${name}' has no knowledge folder yet`));
      process.exit(1);
    }

    const files = scanKnowledge(dir);
    if (files.length === 0) {
      console.log(`No knowledge files in profile '${name}'.`);
      return;
    }

    for (const f of files) {
      const tags = f.tags.length > 0 ? `[${f.tags.join(',')}]` : '';
      console.log(`${f.relPath}  ${c.bold(f.title)}  ${c.gray(tags)}  ${f.bytes}B`);
    }
  },
});
