import { defineCommand } from 'citty';
import install from './connector-app-install.js';
import instances from './connector-app-instances.js';
import uninstall from './connector-app-uninstall.js';

export default defineCommand({
  meta: { name: 'app', description: 'manage app-pattern connectors (github-app)' },
  subCommands: { install, instances, uninstall },
});
