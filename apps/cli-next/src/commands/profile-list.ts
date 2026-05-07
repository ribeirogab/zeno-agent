import { defineCommand } from 'citty';

import { c, formatUptime, rule, statusDot, statusLabel } from '../lib/output.js';
import { load } from '../lib/state.js';

export default defineCommand({
  meta: {
    name: 'list',
    description: 'list all profiles',
  },
  run() {
    const state = load();
    const entries = Object.entries(state.profiles);
    if (entries.length === 0) {
      console.log(c.gray('No profiles. Create one:'));
      console.log(`  ${c.gold('zeno-next profile create <name>')}`);
      return;
    }
    console.log('');
    console.log(
      `  ${c.bold('NAME'.padEnd(18))} ${c.bold('PORT'.padEnd(6))} ${c.bold('STATUS'.padEnd(11))} ${c.bold('UPTIME')}`,
    );
    console.log(`  ${rule(50)}`);
    for (const [name, p] of entries) {
      const sticky = state.currentProfile === name ? c.gold('*') : ' ';
      const uptime = p.status === 'running' ? formatUptime(p.lastStartedAt) : '-';
      const statusCell = `${statusDot(p.status)} ${statusLabel(p.status)}`;
      console.log(
        `${sticky} ${name.padEnd(18)} ${String(p.port).padEnd(6)} ${statusCell.padEnd(20)} ${uptime}`,
      );
    }
    console.log('');
    if (state.currentProfile) {
      console.log(c.gray(`* sticky default (zeno-next profile use <name>)`));
    }
  },
});
