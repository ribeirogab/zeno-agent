import { queries } from '@zeno/db/host';
import { defineCommand } from 'citty';
import { orchestrator } from '../lib/orchestrator/singleton.js';
import { c, formatUptime, rule, statusDot, statusLabel } from '../lib/output.js';
import { db } from '../lib/state.js';

export default defineCommand({
  meta: { name: 'list', description: 'list all profiles' },
  async run() {
    const conn = db();
    const profiles = queries.listProfiles(conn);
    if (profiles.length === 0) {
      console.log(c.gray('No profiles. Create one:'));
      console.log(`  ${c.gold('zeno profile create <profile>')}`);
      return;
    }

    // Join with live container state from Docker (best-effort).
    let liveByProfile = new Map<string, { state: 'running' | 'stopped' | 'failed' }>();
    try {
      const live = await orchestrator().listManagedContainers();
      liveByProfile = new Map(live.map((l) => [l.profile, { state: l.state }]));
    } catch {
      /* daemon down — fall back to DB status */
    }

    const sticky = queries.getSticky(conn);
    console.log('');
    console.log(
      `  ${c.bold('NAME'.padEnd(18))} ${c.bold('PORT'.padEnd(6))} ${c.bold('STATUS'.padEnd(11))} ${c.bold('UPTIME')}`,
    );
    console.log(`  ${rule(50)}`);
    for (const p of profiles) {
      const stickyMark = sticky === p.name ? c.gold('*') : ' ';
      const liveState = liveByProfile.get(p.name)?.state ?? p.status;
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
