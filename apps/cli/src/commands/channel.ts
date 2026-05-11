/**
 * Spec 2026-05-11 — `zeno channel` parent command. Mounts the seven verbs.
 *
 * Channels (slack today, discord/telegram/whatsapp future) are storage-shared with
 * connectors (`kind='channel'`) but get their own CLI subtree so the operator
 * surface stays cohesive. Every mutation routes through `X-Zeno-Origin: cli` so
 * the dashboard `/channels` page stays read-only.
 */

import { defineCommand } from 'citty';
import configure from './channel-configure.js';
import install from './channel-install.js';
import list from './channel-list.js';
import rotate from './channel-rotate.js';
import show from './channel-show.js';
import test from './channel-test.js';
import uninstall from './channel-uninstall.js';

export default defineCommand({
  meta: {
    name: 'channel',
    description: 'manage channels (slack, etc.) installed in this profile',
  },
  subCommands: { list, show, install, configure, test, rotate, uninstall },
});
