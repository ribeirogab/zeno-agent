import { defineCommand, runMain } from 'citty';
import backend from './commands/backend.js';
import connector from './commands/connector.js';
import doctor from './commands/doctor.js';
import logs from './commands/logs.js';
import open from './commands/open.js';
import profile from './commands/profile.js';
import repo from './commands/repo.js';
import restart from './commands/restart.js';
import start from './commands/start.js';
import status from './commands/status.js';
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
    status,
    start,
    stop,
    restart,
    logs,
    open,
    doctor,
    upgrade,
    repo,
    connector,
    backend,
  },
});

runMain(main);
