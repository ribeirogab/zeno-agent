import { spawnSync } from 'node:child_process';
import { queries } from '@zeno/db/host';
import { defineCommand } from 'citty';
import { c, err, info, ok, rule, setQuiet } from '../lib/output.js';
import { type PickerItem, pick } from '../lib/picker.js';
import { confirm } from '../lib/prompt.js';
import { spin } from '../lib/spinner.js';
import { db } from '../lib/state.js';
import {
  listReleases,
  pickTarget,
  type Release,
  type ResolvedTarget,
  shortSha,
  upgradeSteps,
} from '../lib/upgrade.js';
import { getCurrentVersion } from '../lib/version.js';
import {
  compareSemver,
  formatDisplay,
  readMeta,
  type VersionKind,
  type VersionMeta,
} from '../lib/version-meta.js';

export default defineCommand({
  meta: {
    name: 'upgrade',
    description: 'upgrade zeno to a newer release (or pin to a specific version/branch/pr)',
  },
  args: {
    to: { type: 'string', description: 'specific version tag (e.g. v2026.5.10)' },
    unstable: { type: 'boolean', description: 'main HEAD (no CI gate · may break)' },
    branch: { type: 'string', description: 'arbitrary branch (testing)' },
    pr: { type: 'string', description: 'pull request number (testing)' },
    prerelease: { type: 'boolean', description: 'include pre-releases when picking latest' },
    latest: {
      type: 'boolean',
      description: 'jump straight to latest stable (skips the picker)',
    },
    list: { type: 'boolean', description: 'list available versions and exit' },
    notes: { type: 'string', description: 'print release notes for <tag> via gh and exit' },
    force: { type: 'boolean', description: 'allow downgrade to an older version' },
    dryRun: { type: 'boolean', description: 'resolve target + print pipeline steps; no execution' },
    yes: { type: 'boolean', description: 'skip confirmation prompts (unstable/branch/pr)' },
    limit: {
      type: 'string',
      description: 'pagination limit for --list / picker (default 30)',
    },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args, rawArgs }) {
    if (args.quiet) setQuiet(true);
    const conn = db();
    const current = getCurrentVersion(conn);

    // Reject removed flags explicitly (citty silently drops unknown flags).
    const REMOVED = new Set(['--edge', '--beta']);
    for (const raw of rawArgs ?? []) {
      const flag = raw.split('=')[0];
      if (flag && REMOVED.has(flag)) {
        console.error(err(`Unknown flag: ${flag}. Use --unstable instead.`));
        process.exit(1);
      }
    }

    // --notes <tag>: print release body via gh and exit.
    if (args.notes) {
      const r = spawnSync('gh', ['release', 'view', args.notes as string], { stdio: 'inherit' });
      process.exit(r.status ?? 0);
    }

    // Mutex check across target flags.
    const targetFlagsPresent: string[] = [];
    if (args.to) targetFlagsPresent.push('--to');
    if (args.unstable) targetFlagsPresent.push('--unstable');
    if (args.branch) targetFlagsPresent.push('--branch');
    if (args.pr) targetFlagsPresent.push('--pr');
    if (args.latest) targetFlagsPresent.push('--latest');
    if (args.prerelease) targetFlagsPresent.push('--prerelease');
    if (targetFlagsPresent.length > 1) {
      console.error(err(`${targetFlagsPresent.join(' and ')} are mutually exclusive`));
      process.exit(1);
    }

    const limit = args.limit ? Math.max(1, parseInt(args.limit as string, 10) || 30) : undefined;

    let releases: Release[] = [];
    try {
      releases = await listReleases(limit);
    } catch (e) {
      console.error(err((e as Error).message));
      process.exit(1);
    }

    if (args.list) {
      printReleaseTable(releases, current);
      return;
    }

    let resolved: ResolvedTarget | null;
    const explicit =
      args.to || args.prerelease || args.unstable || args.branch || args.pr || args.latest;
    if (explicit) {
      const picked = pickTarget(
        {
          to: args.to as string | undefined,
          prerelease: args.prerelease as boolean | undefined,
          unstable: args.unstable as boolean | undefined,
          branch: args.branch as string | undefined,
          pr: args.pr as string | undefined,
        },
        releases,
      );
      if ('error' in picked) {
        console.error(err(picked.error));
        process.exit(1);
      }
      resolved = picked;
    } else if (process.stdout.isTTY && process.stdin.isTTY) {
      resolved = await pickInteractive(releases, current);
      if (resolved === null) {
        console.log(c.gray('aborted.'));
        return;
      }
    } else {
      resolved = pickLatestStable(releases);
    }

    // Confirmation gate for risky targets.
    if (
      (resolved.kind === 'unstable' || resolved.kind === 'branch' || resolved.kind === 'pr') &&
      !args.yes
    ) {
      if (!process.stdin.isTTY) {
        console.error(err(`--${resolved.kind} requires --yes in non-interactive mode`));
        process.exit(1);
      }
      const okay = await confirm(`${resolved.kind} target may break. continue? (y/N)`);
      if (!okay) {
        console.log(c.gray('aborted.'));
        return;
      }
    }

    // Downgrade guard (only for tags; branch/pr/unstable skip).
    if (resolved.kind === 'tag' && /^v?\d/.test(current) && /^v?\d/.test(resolved.value)) {
      if (compareSemver(resolved.value, current) < 0 && !args.force) {
        console.error(
          err(`downgrade ${current} → ${resolved.value} requires --force (forward-only schema)`),
        );
        process.exit(1);
      }
    }

    // No-op if we are already where we want to be.
    const targetDisplay = formatDisplay({ kind: resolved.kind, value: resolved.value, sha: '' });
    if (resolved.kind === 'tag' && targetDisplay === current) {
      console.log(info(`already on ${c.bold(current)}. nothing to do.`));
      return;
    }

    // --dry-run: print plan and exit.
    if (args.dryRun) {
      const checkoutValue = resolved.value || (resolved.kind === 'unstable' ? 'main' : '');
      console.log('');
      console.log(`  ${c.bold('target')}: ${resolved.kind}:${resolved.value}`);
      console.log(`  ${c.bold('steps')}:`);
      console.log('    1. fetchTags');
      console.log(`    2. checkoutRef(${checkoutValue}, ${resolved.kind})`);
      console.log('    3. setVersion');
      console.log('    4. writeMeta');
      console.log('    5. installDeps (pnpm install --frozen-lockfile)');
      console.log('    6. buildCli (pnpm build --filter @zeno/cli)');
      console.log('    7. buildImage (docker build -t zeno-agent:dev)');
      console.log('');
      return;
    }

    console.log('');
    console.log(`  ${info(`Upgrading: ${c.bold(current)} → ${c.gold(targetDisplay)}`)}`);
    console.log('');

    const prev = readMeta();
    let pipelineSucceeded = false;

    try {
      await spin('fetching tags from origin', async () => {
        upgradeSteps.fetchTags();
      });
      const checkoutLabel =
        resolved.kind === 'unstable'
          ? 'checking out main HEAD'
          : `checking out ${resolved.kind}:${resolved.value}`;
      await spin(checkoutLabel, async () => {
        upgradeSteps.checkoutRef(resolved.value || 'main', resolved.kind);
      });

      const newMeta: VersionMeta = {
        kind: resolved.kind,
        value: resolved.value,
        sha: shortSha(),
      };
      upgradeSteps.setVersion(conn, formatDisplay(newMeta));
      upgradeSteps.writeMeta(newMeta);

      await spin('installing dependencies (pnpm)', async () => {
        upgradeSteps.installDeps();
      });
      await spin('building CLI', async () => {
        upgradeSteps.buildCli();
      });
      await spin('building zeno-agent:dev', async () => {
        upgradeSteps.buildImage();
      });

      pipelineSucceeded = true;

      queries.appendAudit(conn, {
        action: 'cli.upgrade',
        target: null,
        details: { from: current, to: formatDisplay(newMeta) },
      });

      console.log('');
      console.log(ok(`Upgraded to ${c.gold(formatDisplay(newMeta))}`));
    } catch (e) {
      console.error(err(`upgrade failed: ${(e as Error).message}`));
      if (!pipelineSucceeded && prev) {
        try {
          console.log(info('reverting to previous state...'));
          upgradeSteps.checkoutRef(prev.value || 'main', prev.kind);
          upgradeSteps.setVersion(conn, formatDisplay(prev));
          upgradeSteps.writeMeta(prev);
          console.log(ok(`reverted to ${formatDisplay(prev)}`));
        } catch (revertErr) {
          console.error(err(`revert failed: ${(revertErr as Error).message}`));
          const restoreHint =
            prev.kind === 'tag'
              ? `zeno upgrade --to ${prev.value}`
              : prev.kind === 'unstable'
                ? 'zeno upgrade --unstable --yes'
                : prev.kind === 'branch'
                  ? `zeno upgrade --branch ${prev.value} --yes`
                  : `zeno upgrade --pr ${prev.value} --yes`;
          console.error(c.gray(`  → restore manually: ${restoreHint}`));
        }
      }
      process.exit(1);
    }
  },
});

function printReleaseTable(releases: Release[], current: string): void {
  console.log('');
  console.log(`  ${c.bold('Available versions')} ${c.gray(`(current: ${current})`)}`);
  console.log(`  ${rule(60)}`);
  // Pad against the unstyled tag length so ANSI sequences don't inflate width.
  const tagWidth = releases.length > 0 ? Math.max(...releases.map((r) => r.tag.length)) : 0;
  for (const r of releases) {
    const tagStyled = r.tag === current ? c.gold(r.tag) : r.tag;
    const tagPadded = tagStyled + ' '.repeat(Math.max(0, tagWidth - r.tag.length + 2));
    const label = r.prerelease ? c.yellow('pre-release') : c.green('stable');
    const pad = r.tag === current ? '*' : ' ';
    console.log(`  ${pad} ${tagPadded}${label.padEnd(12)}  ${c.gray(r.publishedAt)}`);
  }
  const unstableLabel = c.yellow('unstable');
  const unstablePadding = ' '.repeat(Math.max(0, tagWidth - 'unstable'.length + 2));
  console.log(`    ${unstableLabel}${unstablePadding}${c.gray('main HEAD · no CI gate · may break')}`);
  console.log('');
}

function pickLatestStable(releases: Release[]): ResolvedTarget {
  const stable = releases.find((r) => !r.prerelease);
  if (stable) return { kind: 'tag', value: stable.tag };
  const any = releases[0];
  if (any) return { kind: 'tag', value: any.tag };
  return { kind: 'unstable', value: '' };
}

async function pickInteractive(
  releases: Release[],
  current: string,
): Promise<ResolvedTarget | null> {
  // When `current` is a non-tag (branch/pr/unstable), no row matches —
  // print a small header line ABOVE the picker title so the operator
  // still sees the active ref.
  const matchesAnyTag = releases.some((r) => r.tag === current);
  if (!matchesAnyTag && current) {
    process.stdout.write(`${c.gray(`current: ${current}`)}\n`);
  }

  // Pad against the unstyled tag length so ANSI sequences don't inflate width.
  const tagWidth = releases.length > 0 ? Math.max(...releases.map((r) => r.tag.length)) : 0;
  const items: PickerItem[] = releases.map((r) => {
    const tagStyled = r.tag === current ? c.gold(r.tag) : r.tag;
    const tagPadded = tagStyled + ' '.repeat(Math.max(0, tagWidth - r.tag.length + 2));
    const label = r.prerelease ? c.yellow('pre-release') : c.green('stable');
    return {
      label: `${tagPadded}${label}`,
      hint: r.tag === current ? 'current *' : r.publishedAt.slice(0, 10),
    };
  });
  items.push({ label: c.gray('─'.repeat(40)), hint: '', disabled: true });
  items.push({
    label: c.yellow('unstable'),
    hint: 'main HEAD · no CI gate · may break',
  });

  // initialIndex: first non-prerelease (latest stable). Fallback to 0.
  const initial = releases.findIndex((r) => !r.prerelease);
  const idx = await pick(items, {
    title: `${c.bold('select target')}  ${c.gray('↑/↓ + Enter · q to abort')}`,
    initialIndex: initial >= 0 ? initial : 0,
  });
  if (idx === null) return null;
  if (idx === items.length - 1) return { kind: 'unstable', value: '' };
  const release = releases[idx];
  if (!release) return null;
  return { kind: 'tag', value: release.tag };
}

// Re-export for tests that import from this module.
export type { VersionKind } from '../lib/version-meta.js';
