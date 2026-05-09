import { rmSync } from 'node:fs';
import { queries } from '@zeno/db/host';
import { defineCommand } from 'citty';
import { orchestrator } from '../lib/orchestrator/singleton.js';
import { c, ok, setQuiet, warn } from '../lib/output.js';
import {
  claudeHomeVolumeName,
  containerName,
  profileDir,
  workspaceVolumeName,
} from '../lib/paths.js';
import { requireProfile } from '../lib/profile.js';
import { confirmDestructive } from '../lib/prompt.js';
import { db } from '../lib/state.js';

export default defineCommand({
  meta: { name: 'delete', description: 'permanently delete a profile (confirms)' },
  args: {
    profile: { type: 'positional', description: 'profile identifier', required: true },
    yes: { type: 'boolean', description: 'skip confirmation' },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const conn = db();
    const name = args.profile;
    requireProfile(conn, name);

    console.log('');
    console.log(warn(`This will permanently delete profile ${c.bold(name)}:`));
    console.log(`  - Container:   ${c.gray(containerName(name))}`);
    console.log(`  - Volume:      ${c.gray(workspaceVolumeName(name))}`);
    console.log(`  - Volume:      ${c.gray(claudeHomeVolumeName(name))}`);
    console.log(`  - Directory:   ${c.gray(`~/.zeno/profiles/${name}/`)}`);
    console.log(`  - DB row`);
    console.log('');

    const confirmed = await confirmDestructive(
      `delete profile '${name}'? this destroys volumes and data. (y/N)`,
      { yes: !!args.yes },
    );
    if (!confirmed) {
      console.log(c.gray('aborted.'));
      return;
    }

    const orch = orchestrator();
    try {
      await orch.stopContainer(containerName(name));
    } catch {
      /* container may not exist */
    }
    await orch.removeContainer(containerName(name));
    await orch.removeVolume(workspaceVolumeName(name));
    await orch.removeVolume(claudeHomeVolumeName(name));
    rmSync(profileDir(name), { recursive: true, force: true });
    queries.deleteProfile(conn, name);
    if (queries.getSticky(conn) === name) queries.setSticky(conn, null);
    queries.appendAudit(conn, { action: 'profile.delete', target: name });

    console.log(ok(`Profile ${c.bold(name)} deleted`));
  },
});
