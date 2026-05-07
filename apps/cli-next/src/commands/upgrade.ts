import { defineCommand } from 'citty';

import { c, err, info, ok, rule } from '../lib/output.js';
import { spin } from '../lib/spinner.js';
import { audit, load, save } from '../lib/state.js';

interface Release {
  tag: string;
  prerelease: boolean;
  publishedAt: string;
}

// Mocked release feed. Real impl will hit `gh release list` or GitHub REST.
const MOCK_RELEASES: Release[] = [
  { tag: 'v2026.5.10', prerelease: false, publishedAt: '2026-05-09' },
  { tag: 'v2026.5.10-rc.1', prerelease: true, publishedAt: '2026-05-09' },
  { tag: 'v2026.5.9', prerelease: false, publishedAt: '2026-05-08' },
  { tag: 'v2026.5.8', prerelease: false, publishedAt: '2026-05-07' },
  { tag: 'v2026.5.7', prerelease: false, publishedAt: '2026-05-07' },
];

const EDGE_TAG = 'edge';

function pickTarget(args: {
  to?: string;
  prerelease?: boolean;
  edge?: boolean;
}): string | { error: string } {
  if (args.edge) return EDGE_TAG;
  if (args.to) {
    const found = MOCK_RELEASES.find((r) => r.tag === args.to);
    if (!found) return { error: `version ${args.to} not found. see: zeno-next upgrade --list` };
    return found.tag;
  }
  const filtered = args.prerelease ? MOCK_RELEASES : MOCK_RELEASES.filter((r) => !r.prerelease);
  return filtered[0]?.tag ?? MOCK_RELEASES[0]?.tag ?? EDGE_TAG;
}

export default defineCommand({
  meta: {
    name: 'upgrade',
    description: 'upgrade zeno to a newer release (or pin to a specific version)',
  },
  args: {
    to: { type: 'string', description: 'specific version (e.g. v2026.5.10)' },
    prerelease: { type: 'boolean', description: 'include pre-releases when picking latest' },
    edge: { type: 'boolean', description: 'use main HEAD (untagged)' },
    list: { type: 'boolean', description: 'list available versions and exit' },
  },
  async run({ args }) {
    const state = load();
    const current = state.currentVersion;

    if (args.list) {
      console.log('');
      console.log(`  ${c.bold('Available versions')} ${c.gray(`(current: ${current})`)}`);
      console.log(`  ${rule(50)}`);
      for (const r of MOCK_RELEASES) {
        const tag = r.tag === current ? c.gold(r.tag) : r.tag;
        const label = r.prerelease ? c.yellow('pre-release') : c.green('stable');
        const pad = r.tag === current ? '*' : ' ';
        console.log(`  ${pad} ${tag.padEnd(28)} ${label.padEnd(12)} ${c.gray(r.publishedAt)}`);
      }
      console.log(`    ${'edge'.padEnd(20)} ${c.gray('main HEAD (untagged, always rebuilds)')}`);
      console.log('');
      if (state.currentVersion === current) console.log(c.gray(`  * = current`));
      return;
    }

    const picked = pickTarget(args as { to?: string; prerelease?: boolean; edge?: boolean });
    if (typeof picked === 'object') {
      console.error(err(picked.error));
      process.exit(1);
    }
    const target = picked;

    if (target === current) {
      console.log(info(`already on ${c.bold(current)}. nothing to do.`));
      return;
    }

    console.log('');
    console.log(`  ${info(`Upgrading: ${c.bold(current)} → ${c.gold(target)}`)}`);
    console.log('');

    await spin('fetching tags from origin', 600);
    if (target === EDGE_TAG) {
      await spin('checking out main HEAD', 400);
    } else {
      await spin(`checking out ${target}`, 400);
    }
    await spin('installing dependencies (pnpm)', 2000);
    await spin('building CLI', 1200);
    await spin('building zeno-agent:dev', 3000);

    state.currentVersion = target;
    state.imageBuilt = true;
    audit(state, 'cli.upgrade', null, { from: current, to: target });
    save(state);

    console.log('');
    console.log(ok(`Upgraded to ${c.gold(target)}`));
  },
});
