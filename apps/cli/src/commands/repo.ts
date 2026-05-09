import { defineCommand } from 'citty';
import { setQuiet } from '../lib/output.js';

export default defineCommand({
  meta: { name: 'repo', description: 'print the canonical repo path' },
  args: {
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  run({ args }) {
    if (args.quiet) setQuiet(true);
    console.log('~/.zeno/zeno-agent');
  },
});
