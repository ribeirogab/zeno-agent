import { queries } from '@zeno/db/host';
import { defineCommand } from 'citty';
import { c, formatUptime, rule, setQuiet, statusDot, statusLabel } from '../lib/output.js';
import { resolveLiveStatus, snapshotLive } from '../lib/profile-state.js';
import { db } from '../lib/state.js';
import type { ProfileListItem } from '../types/json-output.js';

export default defineCommand({
  meta: { name: 'list', description: 'list all profiles' },
  args: {
    json: { type: 'boolean', description: 'emit JSON' },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);

    const conn = db();
    const profiles = queries.listProfiles(conn);

    // Single live snapshot — every row resolves its state through the same
    // helper so DB-vs-live drift is impossible.
    const snap = await snapshotLive();

    const sticky = queries.getSticky(conn);

    if (args.json) {
      const rows: ProfileListItem[] = profiles.map((p) => {
        const liveState = resolveLiveStatus(p, snap);
        const uptimeMs =
          liveState === 'running' && p.lastStartedAt ? Date.now() - p.lastStartedAt : null;
        return {
          name: p.name,
          port: p.port,
          status: liveState,
          uptimeMs,
          sticky: sticky === p.name,
        };
      });
      process.stdout.write(`${JSON.stringify(rows)}\n`);
      return;
    }

    if (profiles.length === 0) {
      console.log(c.gray('No profiles. Create one:'));
      console.log(`  ${c.gold('zeno profile create <profile>')}`);
      return;
    }

    console.log('');
    console.log(
      `  ${c.bold('NAME'.padEnd(18))} ${c.bold('PORT'.padEnd(6))} ${c.bold('STATUS'.padEnd(11))} ${c.bold('UPTIME')}`,
    );
    console.log(`  ${rule(50)}`);
    for (const p of profiles) {
      const stickyMark = sticky === p.name ? c.gold('*') : ' ';
      const liveState = resolveLiveStatus(p, snap);
      const uptime = liveState === 'running' ? formatUptime(p.lastStartedAt) : '-';
      const cell = `${statusDot(liveState)} ${statusLabel(liveState)}`;
      console.log(
        `${stickyMark} ${p.name.padEnd(18)} ${String(p.port).padEnd(6)} ${cell.padEnd(20)} ${uptime}`,
      );
    }
    console.log('');
    if (sticky) {
      console.log(c.gray(`* sticky default (zeno profile use <profile>)`));
    }
  },
});
