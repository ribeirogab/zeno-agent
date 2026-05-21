import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderIndex, scanKnowledge } from '@zeno/knowledge';
import { defineCommand } from 'citty';
import { c, ok, setQuiet, warn } from '../lib/output.js';
import { knowledgeDir } from '../lib/paths.js';
import { requireProfile } from '../lib/profile.js';
import { resolveProfile } from '../lib/resolvers.js';
import { db } from '../lib/state.js';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default defineCommand({
  meta: { name: 'index', description: "regenerate the profile's knowledge _index.md" },
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
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const files = scanKnowledge(dir);
    const result = renderIndex(files, { generatedAt: new Date() });
    writeFileSync(join(dir, '_index.md'), result.markdown, 'utf8');

    const totalBytes = files.reduce((acc, f) => acc + f.bytes, 0);
    console.log(
      ok(`Indexed ${files.length} files (${formatBytes(totalBytes)}) in ${c.gray(dir)}`),
    );

    if (result.unresolvedRelated.length > 0) {
      console.log('');
      console.log(warn(`Warning: ${result.unresolvedRelated.length} unresolved related links:`));
      for (const u of result.unresolvedRelated) {
        console.log(`  ${u.file}: ${u.slug}`);
      }
    }
  },
});
