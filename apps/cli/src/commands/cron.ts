/**
 * Spec 2026-05-22 — `zeno cron` parent command. Mounts the eight verbs.
 *
 * Crons live as markdown files under ~/.zeno/profiles/<name>/crons/<slug>/CRON.md.
 * Mutating verbs (`create`, `enable`, `disable`, `delete`) operate on the
 * filesystem directly; the worker's CronManager reconciles within 2s. Only
 * `test` is HTTP (gated by `ZENO_API_WRITES=cli` via `X-Zeno-Origin: cli`).
 */

import { defineCommand } from 'citty';
import cronCreate from './cron-create.js';
import cronDelete from './cron-delete.js';
import cronDisable from './cron-disable.js';
import cronEnable from './cron-enable.js';
import cronList from './cron-list.js';
import cronOpen from './cron-open.js';
import cronShow from './cron-show.js';
import cronTest from './cron-test.js';

export default defineCommand({
  meta: {
    name: 'cron',
    description: 'manage profile crons (filesystem-as-truth, ~/.zeno/profiles/<name>/crons/)',
  },
  subCommands: {
    list: cronList,
    show: cronShow,
    create: cronCreate,
    open: cronOpen,
    enable: cronEnable,
    disable: cronDisable,
    delete: cronDelete,
    test: cronTest,
  },
});
