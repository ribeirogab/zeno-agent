import { defineCommand } from 'citty';
import app from './connector-app.js';
import catalog from './connector-catalog.js';
import disable from './connector-disable.js';
import enable from './connector-enable.js';
import install from './connector-install.js';
import list from './connector-list.js';
import refreshTools from './connector-refresh-tools.js';
import secret from './connector-secret.js';
import show from './connector-show.js';
import test from './connector-test.js';
import tool from './connector-tool.js';
import uninstall from './connector-uninstall.js';

export default defineCommand({
  meta: { name: 'connector', description: 'manage MCP connectors' },
  subCommands: {
    list,
    show,
    catalog,
    install,
    enable,
    disable,
    uninstall,
    test,
    'refresh-tools': refreshTools,
    tool,
    secret,
    app,
  },
});
