import { defineCommand } from 'citty';
import add from './connector-app-installations-add.js';
import discover from './connector-app-installations-discover.js';

export default defineCommand({
  meta: { name: 'installations', description: 'manage github-app installations' },
  subCommands: { discover, add },
});
