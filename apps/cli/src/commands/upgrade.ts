import { queries } from '@zeno/db/host';
import { defineCommand } from 'citty';
import { c, err, info, ok, rule } from '../lib/output.js';
import { pick } from '../lib/picker.js';
import { spin } from '../lib/spinner.js';
import { db } from '../lib/state.js';
import { EDGE, listReleases, pickTarget, type Release, upgradeSteps } from '../lib/upgrade.js';
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
    latest: {
      type: 'boolean',
      description: 'jump straight to latest stable (skips the picker)',
    },
    list: { type: 'boolean', description: 'list available versions and exit' },
    force: { type: 'boolean', description: 'allow downgrade to an older version' },
  },
  async run({ args }) {
    const conn = db();
    const current = getCurrentVersion(conn);

    let releases: Release[] = [];
    try {
      releases = await listReleases();
    } catch (e) {
      console.error(err((e as Error).message));
      process.exit(1);
    }

    if (args.list) {
      printReleaseTable(releases, current);
      return;
    }

    let target: string | null;
    const explicit = args.to || args.prerelease || args.edge || args.latest;
    if (explicit) {
      const picked = pickTarget(
        {
          to: args.to as string | undefined,
          prerelease: args.prerelease as boolean | undefined,
          edge: args.edge as boolean | undefined,
        },
        releases,
      );
      if (typeof picked === 'object') {
        console.error(err(picked.error));
        process.exit(1);
      }
      target = picked;
    } else {
      // No flags + TTY → interactive picker. Non-TTY (piped/CI) → latest stable.
      if (!process.stdout.isTTY || !process.stdin.isTTY) {
        target = pickLatestStable(releases);
      } else {
        target = await pickInteractive(releases, current);
        if (target === null) {
          console.log(c.gray('aborted.'));
          return;
        }
      }
    }

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

function printReleaseTable(releases: Release[], current: string): void {
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
}

function pickLatestStable(releases: Release[]): string {
  return releases.find((r) => !r.prerelease)?.tag ?? releases[0]?.tag ?? EDGE;
}

async function pickInteractive(releases: Release[], current: string): Promise<string | null> {
  const items = [
    ...releases.map((r) => ({
      label:
        (r.tag === current ? `${c.gold(r.tag)}  ` : `${r.tag}  `) +
        (r.prerelease ? c.yellow('pre-release') : c.green('stable')),
      hint: r.tag === current ? 'current' : r.publishedAt.slice(0, 10),
    })),
    {
      label: 'edge',
      hint: 'main HEAD (always rebuilds)',
    },
  ];
  const initial = releases.findIndex((r) => r.tag === current);
  const idx = await pick(items, {
    title: `${c.bold('select target')}  ${c.gray('↑/↓ + Enter · q to abort')}`,
    initialIndex: initial >= 0 ? initial : 0,
  });
  if (idx === null) return null;
  if (idx === releases.length) return EDGE;
  return releases[idx]?.tag ?? null;
}
