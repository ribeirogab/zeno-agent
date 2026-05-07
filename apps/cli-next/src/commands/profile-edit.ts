import { defineCommand } from 'citty';

import { c, err, ok, warn } from '../lib/output.js';
import { isPortTaken, PORT_MAX, PORT_MIN, requireProfile } from '../lib/profile.js';
import { audit, load, save } from '../lib/state.js';

export default defineCommand({
  meta: {
    name: 'edit',
    description: 'edit a profile (port only for now)',
  },
  args: {
    name: { type: 'positional', description: 'profile name', required: true },
    port: {
      type: 'string',
      description: `new host port (${PORT_MIN}-${PORT_MAX})`,
      required: true,
    },
  },
  run({ args }) {
    const state = load();
    const name = args.name;
    const p = requireProfile(state, name);
    const newPort = Number(args.port);
    if (!Number.isInteger(newPort) || newPort < PORT_MIN || newPort > PORT_MAX) {
      console.error(err(`port must be integer in [${PORT_MIN}, ${PORT_MAX}]`));
      process.exit(1);
    }
    if (isPortTaken(state, newPort, name)) {
      console.error(err(`port ${newPort} already taken`));
      process.exit(1);
    }
    const oldPort = p.port;
    p.port = newPort;
    audit(state, 'profile.edit', name, { from: { port: oldPort }, to: { port: newPort } });
    save(state);
    console.log(ok(`Profile ${c.bold(name)} port: ${oldPort} → ${c.gold(String(newPort))}`));
    if (p.status === 'running') {
      console.log(warn(`restart required: ${c.gold(`zeno-next restart ${name}`)}`));
    }
  },
});
