import { defineCommand, runMain } from 'citty';
import build from './commands/build.js';
import dockerCmd from './commands/docker.js';
import doctor from './commands/doctor.js';
import logs from './commands/logs.js';
import open from './commands/open.js';
import profile from './commands/profile.js';
import restart from './commands/restart.js';
import shell from './commands/shell.js';
import start from './commands/start.js';
import status from './commands/status.js';
import stop from './commands/stop.js';
import update from './commands/update.js';
import { readVersion } from './lib/version.js';
import { resolveZenoHome } from './lib/zeno-home.js';

let version: string;
try {
  version = readVersion(resolveZenoHome());
} catch {
  version = '0.0.0-unknown';
}

const main = defineCommand({
  meta: {
    name: 'zeno',
    version,
    description: 'zeno-agent CLI',
  },
  subCommands: {
    start,
    stop,
    restart,
    status,
    shell,
    logs,
    build,
    doctor,
    open,
    update,
    docker: dockerCmd,
    profile,
  },
});

runMain(main);
