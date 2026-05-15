// Resolve available zeno releases via `gh release list` (preferred) or the
// unauthenticated GitHub REST endpoint as fallback. Apply via git checkout +
// pnpm install + pnpm build + docker build.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from '@zeno/db/host';
import { queries } from '@zeno/db/host';
import { ZENO_HOME } from './paths.js';
import { type VersionKind, type VersionMeta, writeMeta as writeMetaImpl } from './version-meta.js';

function parsePackageManagerVersion(home: string): string {
  const pkgPath = join(home, 'package.json');
  const raw = readFileSync(pkgPath, 'utf8');
  const parsed = JSON.parse(raw) as { packageManager?: string };
  const value = parsed.packageManager;
  if (!value || !value.startsWith('pnpm@')) {
    throw new Error('package.json missing "packageManager" field (corepack bootstrap requires it)');
  }
  return value.slice('pnpm@'.length);
}

export interface Release {
  tag: string;
  prerelease: boolean;
  publishedAt: string;
}

export interface ResolvedTarget {
  kind: VersionKind;
  value: string;
}

const REPO = 'ribeirogab/zeno-agent';
const DEFAULT_LIMIT = 30;
const API_BASE = process.env.ZENO_INSTALL_API_BASE ?? 'https://api.github.com';

function ghAvailable(): boolean {
  const which = spawnSync('which', ['gh'], { encoding: 'utf8' });
  if (which.status !== 0) return false;
  const auth = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' });
  return auth.status === 0;
}

async function listReleasesViaGh(limit: number): Promise<Release[]> {
  const r = spawnSync(
    'gh',
    [
      'release',
      'list',
      '--repo',
      REPO,
      '--limit',
      String(limit),
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

async function listReleasesViaRest(limit: number): Promise<Release[]> {
  const url = `${API_BASE}/repos/${REPO}/releases?per_page=${limit}`;
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

export async function listReleases(limit = DEFAULT_LIMIT): Promise<Release[]> {
  if (ghAvailable()) {
    return listReleasesViaGh(limit);
  }
  try {
    return await listReleasesViaRest(limit);
  } catch (e) {
    throw new Error(`cannot fetch releases: ${(e as Error).message}`);
  }
}

export interface PickArgs {
  to?: string | undefined;
  prerelease?: boolean | undefined;
  unstable?: boolean | undefined;
  branch?: string | undefined;
  pr?: string | undefined;
}

export function pickTarget(
  args: PickArgs,
  releases: Release[],
): ResolvedTarget | { error: string } {
  if (args.unstable) return { kind: 'unstable', value: '' };
  if (args.branch) return { kind: 'branch', value: args.branch };
  if (args.pr) return { kind: 'pr', value: args.pr };
  if (args.to) {
    const found = releases.find((r) => r.tag === args.to);
    if (!found) return { error: `version ${args.to} not found. see: zeno upgrade --list` };
    return { kind: 'tag', value: found.tag };
  }
  const filtered = args.prerelease ? releases : releases.filter((r) => !r.prerelease);
  const tag = filtered[0]?.tag ?? releases[0]?.tag;
  if (tag) return { kind: 'tag', value: tag };
  return { kind: 'unstable', value: '' };
}

function run(cmd: string, args: string[]): void {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ZENO_HOME });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited ${r.status}`);
}

export function shortSha(): string {
  const r = spawnSync('git', ['-C', ZENO_HOME, 'rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8',
  });
  return (r.stdout ?? '').trim() || 'unknown';
}

/** Run the upgrade pipeline against ZENO_HOME. Caller wraps each step in spinners. */
export const upgradeSteps = {
  fetchTags(): void {
    run('git', ['fetch', '--tags']);
  },
  checkoutRef(target: string, kind: VersionKind): void {
    if (kind === 'unstable') {
      // Use an explicit refspec so the remote-tracking branch always lands at
      // origin/main, even when the operator's clone has a restricted refspec
      // (install.sh runs `git clone --branch main` which sets the refspec to
      // `+refs/heads/main:refs/remotes/origin/main` only).
      run('git', ['fetch', 'origin', '+main:refs/remotes/origin/main']);
      run('git', ['checkout', '-B', 'main', 'origin/main']);
    } else if (kind === 'branch') {
      // Explicit refspec to create the remote-tracking branch; otherwise a
      // restricted `remote.origin.fetch` (typical of `--branch main` clones)
      // would leave `origin/<target>` undefined even after a successful fetch.
      run('git', ['fetch', 'origin', `+${target}:refs/remotes/origin/${target}`]);
      run('git', ['checkout', '-B', target, `origin/${target}`]);
    } else if (kind === 'pr') {
      run('gh', ['pr', 'checkout', target]);
    } else {
      // tag
      run('git', ['fetch', '--tags']);
      run('git', ['checkout', target]);
    }
  },
  setVersion(db: DB, display: string): void {
    queries.setVersion(db, display);
  },
  writeMeta(meta: VersionMeta): void {
    writeMetaImpl(meta);
  },
  bootstrapPnpm(): void {
    const version = parsePackageManagerVersion(ZENO_HOME);
    const env = { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' };
    const enable = spawnSync('corepack', ['enable'], { stdio: 'inherit', cwd: ZENO_HOME, env });
    if (enable.status !== 0) {
      throw new Error(`bootstrapPnpm failed: corepack enable exited ${enable.status}`);
    }
    const prepare = spawnSync('corepack', ['prepare', `pnpm@${version}`, '--activate'], {
      stdio: 'inherit',
      cwd: ZENO_HOME,
      env,
    });
    if (prepare.status !== 0) {
      throw new Error(`bootstrapPnpm failed: corepack prepare exited ${prepare.status}`);
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
