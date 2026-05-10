import { queries } from '@zeno/db/host';
import { defineCommand } from 'citty';
import { c, err, ok, setQuiet, warn } from '../lib/output.js';
import { isPortTaken, PORT_MAX, PORT_MIN, requireProfile } from '../lib/profile.js';
import { resolveProfile } from '../lib/resolvers.js';
import { db } from '../lib/state.js';

export default defineCommand({
  meta: { name: 'edit', description: 'edit a profile (port only for now)' },
  args: {
    profile: { type: 'positional', description: 'profile identifier', required: false },
    port: {
      type: 'string',
      description: `new host port (${PORT_MIN}-${PORT_MAX})`,
      required: true,
    },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const conn = db();
    const { name } = await resolveProfile(args.profile as string | undefined, {
      ignoreSticky: true,
    });
    const p = requireProfile(conn, name);
    const newPort = Number(args.port);
    if (!Number.isInteger(newPort) || newPort < PORT_MIN || newPort > PORT_MAX) {
      console.error(err(`port must be integer in [${PORT_MIN}, ${PORT_MAX}]`));
      process.exit(1);
    }
    if (isPortTaken(conn, newPort, name)) {
      console.error(err(`port ${newPort} already taken`));
      process.exit(1);
    }
    const oldPort = p.port;
    queries.updateProfilePort(conn, name, newPort);
    queries.appendAudit(conn, {
      action: 'profile.edit',
      target: name,
      details: { from: { port: oldPort }, to: { port: newPort } },
    });
    console.log(ok(`Profile ${c.bold(name)} port: ${oldPort} → ${c.gold(String(newPort))}`));
    if (p.status === 'running') {
      console.log(warn(`restart required: ${c.gold(`zeno restart ${name}`)}`));
    }
  },
});
