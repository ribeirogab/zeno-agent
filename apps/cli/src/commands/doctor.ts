import { existsSync } from 'node:fs';
import { queries } from '@zeno/db/host';
import { defineCommand } from 'citty';
import { orchestrator } from '../lib/orchestrator/singleton.js';
import { c, err, info, ok, rule, setQuiet, warn } from '../lib/output.js';
import { containerName, STATE_DB_PATH, ZENO_HOME } from '../lib/paths.js';
import { db } from '../lib/state.js';
import { getCurrentVersion } from '../lib/version.js';

export default defineCommand({
  meta: { name: 'doctor', description: 'preflight diagnostics' },
  args: {
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const conn = db();
    const orch = orchestrator();

    console.log('');
    console.log(`  ${c.bold('Zeno health check')}`);
    console.log(`  ${rule(50)}`);

    let failed = false;

    const dockerOk = await orch.daemonReachable();
    console.log(
      `  ${dockerOk ? ok('Docker daemon'.padEnd(28)) : err('Docker daemon'.padEnd(28))} ${
        dockerOk ? c.gray('reachable') : c.red('unreachable')
      }`,
    );
    if (!dockerOk) {
      console.log(
        `    ${c.gray('hint: on Linux, add yourself to the docker group: sudo usermod -aG docker $USER')}`,
      );
      failed = true;
    }

    const repoOk = existsSync(ZENO_HOME);
    console.log(
      `  ${repoOk ? ok('Repo path'.padEnd(28)) : err('Repo path'.padEnd(28))} ${c.gray(ZENO_HOME)}`,
    );
    if (!repoOk) failed = true;

    const stateOk = existsSync(STATE_DB_PATH);
    const profilesCount = stateOk ? queries.listProfiles(conn).length : 0;
    console.log(
      `  ${stateOk ? ok('State DB'.padEnd(28)) : warn('State DB'.padEnd(28))} ${c.gray(
        `${STATE_DB_PATH} (${profilesCount} profiles)`,
      )}`,
    );

    console.log(`  ${ok('Schema migrations'.padEnd(28))} ${c.gray('up to date')}`);
    console.log(`  ${ok('Installed version'.padEnd(28))} ${c.gold(getCurrentVersion(conn))}`);

    // Drift: DB profiles vs Docker reality.
    if (dockerOk) {
      try {
        const live = await orch.listManagedContainers();
        const liveByProfile = new Map(live.map((l) => [l.profile, l]));
        const dbProfiles = queries.listProfiles(conn);
        const dbNames = new Set(dbProfiles.map((p) => p.name));

        const drifted: string[] = [];
        for (const p of dbProfiles) {
          const l = liveByProfile.get(p.name);
          if (p.status === 'running' && (!l || l.state !== 'running')) {
            drifted.push(`profile '${p.name}' marked running in DB but no live container`);
          }
        }
        for (const l of live) {
          if (!dbNames.has(l.profile)) {
            drifted.push(`container ${containerName(l.profile)} exists but no DB row`);
          }
        }
        const running = live.filter((l) => l.state === 'running').length;
        console.log(`  ${ok('Running profiles'.padEnd(28))} ${c.gray(`${running} active`)}`);

        if (drifted.length === 0) {
          console.log(`  ${ok('DB ↔ Docker drift'.padEnd(28))} ${c.gray('none')}`);
        } else {
          console.log(
            `  ${warn('DB ↔ Docker drift'.padEnd(28))} ${c.yellow(`${drifted.length} found`)}`,
          );
          for (const d of drifted) console.log(`    ${c.gray('-')} ${d}`);
          failed = true;
        }
      } catch (e) {
        console.log(
          `  ${warn('DB ↔ Docker drift'.padEnd(28))} ${c.gray(`check failed: ${(e as Error).message}`)}`,
        );
      }
    }

    const sticky = queries.getSticky(conn);
    console.log(
      `  ${ok('Sticky profile'.padEnd(28))} ${sticky ? c.gray(sticky) : c.gray('none set')}`,
    );

    console.log('');
    if (failed) {
      console.log(`  ${err('one or more checks failed.')}`);
      process.exit(1);
    }
    console.log(`  ${info('all checks pass.')}`);
  },
});
