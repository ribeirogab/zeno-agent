import { queries } from '@zeno/db/host';
import { defineCommand } from 'citty';
import { orchestrator } from '../lib/orchestrator/singleton.js';
import { c, info, setQuiet } from '../lib/output.js';
import { containerName } from '../lib/paths.js';
import { requireProfile } from '../lib/profile.js';
import { resolveProfile } from '../lib/resolvers.js';
import { spin } from '../lib/spinner.js';
import { db } from '../lib/state.js';

export default defineCommand({
  meta: { name: 'stop', description: 'stop a profile container (default = sticky)' },
  args: {
    profile: {
      type: 'positional',
      description: 'profile identifier (omit for sticky)',
      required: false,
    },
    all: { type: 'boolean', description: 'stop every profile' },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const conn = db();
    const targets: string[] = args.all
      ? queries.listProfiles(conn).map((p) => p.name)
      : [(await resolveProfile(args.profile as string | undefined, { ignoreSticky: true })).name];
    if (targets.length === 0) {
      console.log(c.gray('no profiles to stop.'));
      return;
    }

    const orch = orchestrator();
    let failures = 0;
    for (const name of targets) {
      try {
        requireProfile(conn, name);
        const cName = containerName(name);
        const live = await orch.inspectContainer(cName);
        if (!live || live.state !== 'running') {
          console.log(info(`profile ${c.bold(name)} already stopped`));
          continue;
        }
        await spin(`stopping container ${c.gray(cName)}`, () => orch.stopContainer(cName), {
          successText: `Container ${c.gray(cName)} stopped`,
        });
        queries.updateProfileStatus(conn, name, { status: 'stopped', lastStoppedAt: Date.now() });
        queries.appendAudit(conn, { action: 'profile.stop', target: name });
      } catch (e) {
        failures++;
        console.error(c.red(`failed: ${name} — ${(e as Error).message}`));
      }
    }
    if (args.all) {
      console.log(c.gray(`${targets.length - failures}/${targets.length} succeeded`));
    }
    if (failures > 0) process.exit(1);
  },
});
