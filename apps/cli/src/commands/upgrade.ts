import { queries } from '@zeno/db/host';
import { defineCommand } from 'citty';
import { c, err, info, ok, rule } from '../lib/output.js';
import { spin } from '../lib/spinner.js';
import { db } from '../lib/state.js';
import { EDGE, listReleases, pickTarget, upgradeSteps } from '../lib/upgrade.js';
import { getCurrentVersion } from '../lib/version.js';

export default defineCommand({
  meta: {
    name: 'upgrade',
    description: 'upgrade zeno to a newer release (or pin to a specific version)',
  },
  args: {
    to: { type: 'string', description: 'specific version (e.g. v2026.5.10)' },
    prerelease: {
      type: 'boolean',
      description: 'include pre-releases when picking latest',
    },
    edge: { type: 'boolean', description: 'use main HEAD (untagged)' },
    list: { type: 'boolean', description: 'list available versions and exit' },
    force: { type: 'boolean', description: 'allow downgrade to an older version' },
  },
  async run({ args }) {
    const conn = db();
    const current = getCurrentVersion(conn);

    let releases: Awaited<ReturnType<typeof listReleases>> = [];
    try {
      releases = await listReleases();
    } catch (e) {
      console.error(err((e as Error).message));
      process.exit(1);
    }

    if (args.list) {
      console.log('');
      console.log(`  ${c.bold('Available versions')} ${c.gray(`(current: ${current})`)}`);
      console.log(`  ${rule(60)}`);
      for (const r of releases) {
        const tag = r.tag === current ? c.gold(r.tag) : r.tag;
        const label = r.prerelease ? c.yellow('pre-release') : c.green('stable');
        const pad = r.tag === current ? '*' : ' ';
        console.log(`  ${pad} ${tag.padEnd(28)} ${label.padEnd(12)} ${c.gray(r.publishedAt)}`);
      }
      console.log(`    ${'edge'.padEnd(28)} ${c.gray('main HEAD (untagged, always rebuilds)')}`);
      console.log('');
      return;
    }

    const picked = pickTarget(args, releases);
    if (typeof picked === 'object') {
      console.error(err(picked.error));
      process.exit(1);
    }
    const target = picked;

    if (target === current) {
      console.log(info(`already on ${c.bold(current)}. nothing to do.`));
      return;
    }

    // Downgrade guard.
    if (
      target !== EDGE &&
      /^v\d/.test(current) &&
      /^v\d/.test(target) &&
      target < current &&
      !args.force
    ) {
      console.error(err(`downgrade ${current} → ${target} requires --force (forward-only schema)`));
      process.exit(1);
    }

    console.log('');
    console.log(`  ${info(`Upgrading: ${c.bold(current)} → ${c.gold(target)}`)}`);
    console.log('');

    await spin('fetching tags from origin', async () => upgradeSteps.fetchTags());
    await spin(target === EDGE ? 'checking out main HEAD' : `checking out ${target}`, async () =>
      upgradeSteps.checkoutTag(target),
    );
    await spin('installing dependencies (pnpm)', async () => upgradeSteps.installDeps());
    await spin('building CLI', async () => upgradeSteps.buildCli());
    await spin('building zeno-agent:dev', async () => upgradeSteps.buildImage());

    queries.setVersion(conn, target);
    queries.appendAudit(conn, {
      action: 'cli.upgrade',
      target: null,
      details: { from: current, to: target },
    });

    console.log('');
    console.log(ok(`Upgraded to ${c.gold(target)}`));
  },
});
