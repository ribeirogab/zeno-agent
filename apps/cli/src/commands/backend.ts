/**
 * Spec 0072 — `zeno backend` parent command. Mounts the six subcommands.
 */

import { defineCommand } from 'citty';
import configure from './backend-configure.js';
import list from './backend-list.js';
import remove from './backend-remove.js';
import rotate from './backend-rotate.js';
import show from './backend-show.js';
import test from './backend-test.js';

export default defineCommand({
  meta: {
    name: 'backend',
    description: 'manage agent backend (claude-code) credentials',
  },
  subCommands: { list, show, configure, rotate, test, remove },
});
