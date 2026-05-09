import { defineCommand } from 'citty';
import bulk from './connector-tool-bulk.js';
import list from './connector-tool-list.js';
import set from './connector-tool-set.js';

export default defineCommand({
  meta: { name: 'tool', description: 'inspect or change per-tool permissions' },
  subCommands: { list, set, bulk },
});
