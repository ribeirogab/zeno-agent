import { defineCommand, runMain } from 'citty';
import doctor from './commands/doctor.js';
import logs from './commands/logs.js';
import open from './commands/open.js';
import profile from './commands/profile.js';
import repo from './commands/repo.js';
import restart from './commands/restart.js';
import start from './commands/start.js';
import stop from './commands/stop.js';
import upgrade from './commands/upgrade.js';
import { readVersionFromPackage } from './lib/version.js';

const main = defineCommand({
  meta: {
    name: 'zeno',
    version: readVersionFromPackage(),
    description: 'zeno multi-profile CLI',
  },
  subCommands: {
    profile,
    start,
    stop,
    restart,
    logs,
    open,
    doctor,
    upgrade,
    repo,
  },
});

runMain(main);
