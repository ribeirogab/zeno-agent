import { defineCommand } from 'citty';
import index from './knowledge-index.js';
import list from './knowledge-list.js';
import open from './knowledge-open.js';

export default defineCommand({
  meta: {
    name: 'knowledge',
    description: 'manage the per-profile knowledge folder (list, open, index)',
  },
  subCommands: { list, open, index },
});
