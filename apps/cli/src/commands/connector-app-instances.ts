import { defineCommand } from 'citty';
import add from './connector-app-instances-add.js';
import discover from './connector-app-instances-discover.js';

export default defineCommand({
  meta: {
    name: 'instances',
    description: 'manage app-pattern catalog instances (e.g. github-app installations)',
  },
  subCommands: { discover, add },
});
