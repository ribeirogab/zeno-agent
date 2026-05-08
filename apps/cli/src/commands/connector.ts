import { defineCommand } from 'citty';
import install from './connector-install.js';
import list from './connector-list.js';
import show from './connector-show.js';

export default defineCommand({
  meta: { name: 'connector', description: 'manage MCP connectors' },
  subCommands: {
    list,
    show,
    install,
  },
});
