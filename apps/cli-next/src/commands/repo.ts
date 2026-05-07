import { defineCommand } from 'citty';

export default defineCommand({
  meta: {
    name: 'repo',
    description: 'print the canonical repo path',
  },
  run() {
    console.log('~/.zeno/zeno-agent');
  },
});
