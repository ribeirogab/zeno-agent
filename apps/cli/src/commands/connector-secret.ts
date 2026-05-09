import { defineCommand } from 'citty';
import list from './connector-secret-list.js';
import reveal from './connector-secret-reveal.js';
import rotate from './connector-secret-rotate.js';
import set from './connector-secret-set.js';

export default defineCommand({
  meta: { name: 'secret', description: 'inspect or update connector secrets' },
  subCommands: { list, set, rotate, reveal },
});
