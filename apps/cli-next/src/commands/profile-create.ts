import { defineCommand } from 'citty';

import { c, err, ok } from '../lib/output.js';
import {
  generateMasterKey,
  isPortTaken,
  nextAvailablePort,
  PORT_MAX,
  PORT_MIN,
  validateName,
} from '../lib/profile.js';
import { audit, load, save } from '../lib/state.js';

export default defineCommand({
  meta: {
    name: 'create',
    description: 'create a new profile',
  },
  args: {
    name: {
      type: 'positional',
      description: 'profile name (lowercase, kebab-case)',
      required: true,
    },
    port: {
      type: 'string',
      description: `host port (${PORT_MIN}-${PORT_MAX}). auto-allocated if omitted`,
    },
  },
  run({ args }) {
    const state = load();
    const name = args.name;
    const validation = validateName(name);
    if (validation !== true) {
      console.error(err(validation));
      process.exit(1);
    }
    if (state.profiles[name]) {
      console.error(err(`profile '${name}' already exists`));
      process.exit(1);
    }
    let port: number;
    if (args.port) {
      const parsed = Number(args.port);
      if (!Number.isInteger(parsed) || parsed < PORT_MIN || parsed > PORT_MAX) {
        console.error(err(`port must be integer in [${PORT_MIN}, ${PORT_MAX}]`));
        process.exit(1);
      }
      if (isPortTaken(state, parsed)) {
        console.error(err(`port ${parsed} already taken`));
        process.exit(1);
      }
      port = parsed;
    } else {
      const auto = nextAvailablePort(state);
      if (auto === null) {
        console.error(err(`no available ports in [${PORT_MIN}, ${PORT_MAX}]`));
        process.exit(1);
      }
      port = auto;
    }

    const now = new Date().toISOString();
    state.profiles[name] = {
      port,
      status: 'stopped',
      createdAt: now,
      lastStartedAt: null,
      lastStoppedAt: null,
      masterKey: generateMasterKey(),
    };
    audit(state, 'profile.create', name, { port });
    save(state);

    console.log(ok(`Profile ${c.bold(name)} created`));
    console.log(`  Port:        ${c.gold(String(port))}`);
    console.log(`  State path:  ${c.gray(`~/.zeno/profiles/${name}/`)}`);
    console.log(`  Generated:   ${c.gray('ZENO_MASTER_KEY (64 hex)')}`);
    console.log(`  Created:     ${c.gray('.env, USER.md from _template/')}`);
    console.log('');
    console.log(`  ${c.gray('Next:')}  edit ~/.zeno/profiles/${name}/USER.md`);
    console.log(`  ${c.gray('Then:')}  ${c.gold(`zeno-next start ${name}`)}`);
  },
});
