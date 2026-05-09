import { defineCommand } from 'citty';
import install from './connector-app-install.js';
import installations from './connector-app-installations.js';
import uninstall from './connector-app-uninstall.js';

export default defineCommand({
  meta: { name: 'app', description: 'manage app-pattern connectors (github-app)' },
  subCommands: { install, installations, uninstall },
});
