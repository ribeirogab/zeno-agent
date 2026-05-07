// Resolve available zeno releases via `gh release list` (preferred) or the
// unauthenticated GitHub REST endpoint as fallback. Apply via git checkout +
// pnpm install + pnpm build + docker build.

import { spawnSync } from 'node:child_process';
import { ZENO_HOME } from './paths.js';

export interface Release {
  tag: string;
  prerelease: boolean;
  publishedAt: string;
}

const REPO = 'ribeirogab/zeno-agent';
const EDGE_TAG = 'edge';

function ghAvailable(): boolean {
  const which = spawnSync('which', ['gh'], { encoding: 'utf8' });
  if (which.status !== 0) return false;
  const auth = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' });
  return auth.status === 0;
}

async function listReleasesViaGh(): Promise<Release[]> {
  const r = spawnSync(
    'gh',
    [
      'release',
      'list',
      '--repo',
      REPO,
      '--limit',
      '10',
      '--json',
      'tagName,isPrerelease,publishedAt,name',
    ],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(`gh release list failed: ${r.stderr}`);
  const raw = JSON.parse(r.stdout) as Array<{
    tagName: string;
    isPrerelease: boolean;
    publishedAt: string;
  }>;
  return raw.map((x) => ({
    tag: x.tagName,
    prerelease: x.isPrerelease,
    publishedAt: x.publishedAt,
  }));
}

async function listReleasesViaRest(): Promise<Release[]> {
  const url = `https://api.github.com/repos/${REPO}/releases?per_page=10`;
  const res = await fetch(url, { headers: { 'User-Agent': 'zeno-cli' } });
  if (!res.ok) throw new Error(`GitHub REST returned ${res.status}`);
  const raw = (await res.json()) as Array<{
    tag_name: string;
    prerelease: boolean;
    published_at: string;
  }>;
  return raw.map((x) => ({
    tag: x.tag_name,
    prerelease: x.prerelease,
    publishedAt: x.published_at,
  }));
}

export async function listReleases(): Promise<Release[]> {
  if (ghAvailable()) {
    return listReleasesViaGh();
  }
  try {
    return await listReleasesViaRest();
  } catch (e) {
    throw new Error(`cannot fetch releases: ${(e as Error).message}`);
  }
}

export interface PickArgs {
  to?: string | undefined;
  prerelease?: boolean | undefined;
  edge?: boolean | undefined;
}

export function pickTarget(args: PickArgs, releases: Release[]): string | { error: string } {
  if (args.edge) return EDGE_TAG;
  if (args.to) {
    const found = releases.find((r) => r.tag === args.to);
    if (!found) return { error: `version ${args.to} not found. see: zeno upgrade --list` };
    return found.tag;
  }
  const filtered = args.prerelease ? releases : releases.filter((r) => !r.prerelease);
  return filtered[0]?.tag ?? releases[0]?.tag ?? EDGE_TAG;
}

function run(cmd: string, args: string[]): void {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ZENO_HOME });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited ${r.status}`);
}

/** Run the upgrade pipeline against ZENO_HOME. Caller wraps each step in spinners. */
export const upgradeSteps = {
  fetchTags(): void {
    run('git', ['fetch', '--tags']);
  },
  checkoutTag(tag: string): void {
    if (tag === EDGE_TAG) {
      run('git', ['checkout', 'main']);
      run('git', ['pull', '--ff-only']);
    } else {
      run('git', ['checkout', tag]);
    }
  },
  installDeps(): void {
    run('pnpm', ['install', '--frozen-lockfile']);
  },
  buildCli(): void {
    run('pnpm', ['build', '--filter', '@zeno/cli']);
  },
  buildImage(): void {
    run('docker', ['build', '-t', 'zeno-agent:dev', '-f', 'infra/Dockerfile', '.']);
  },
};

export const EDGE = EDGE_TAG;
