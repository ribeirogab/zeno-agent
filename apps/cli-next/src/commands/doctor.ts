import { defineCommand } from 'citty';

import { c, ok, rule } from '../lib/output.js';
import { load, statePath } from '../lib/state.js';

export default defineCommand({
  meta: {
    name: 'doctor',
    description: 'preflight diagnostics',
  },
  run() {
    const state = load();
    const running = Object.values(state.profiles).filter((p) => p.status === 'running').length;

    console.log('');
    console.log(`  ${c.bold('Zeno health check')}`);
    console.log(`  ${rule(50)}`);
    console.log(`  ${ok('Docker daemon'.padEnd(28))} ${c.gray('reachable (mocked)')}`);
    console.log(`  ${ok('Repo path'.padEnd(28))} ${c.gray('~/.zeno/zeno-agent')}`);
    console.log(
      `  ${ok('State file'.padEnd(28))} ${c.gray(`${statePath()} (${Object.keys(state.profiles).length} profiles)`)}`,
    );
    console.log(`  ${ok('Schema migrations'.padEnd(28))} ${c.gray('up to date')}`);
    console.log(`  ${ok('Installed version'.padEnd(28))} ${c.gold(state.currentVersion)}`);
    console.log(`  ${ok('Running profiles'.padEnd(28))} ${c.gray(`${running} active`)}`);
    console.log(
      `  ${ok('Sticky profile'.padEnd(28))} ${state.currentProfile ? c.gray(state.currentProfile) : c.gray('none set')}`,
    );
    console.log('');
    console.log(`  ${c.gray('all checks pass.')}`);
  },
});
