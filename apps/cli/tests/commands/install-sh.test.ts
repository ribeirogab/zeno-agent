import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SH = resolve(__dirname, '../../../../install.sh');

function shRun(...flags: string[]): { status: number; stdout: string; stderr: string } {
  // ZENO_INSTALL_API_BASE points to a deliberately-unreachable host so the
  // fallback chain (latest → prerelease → main) terminates at "main" deterministically
  // when the parser does not short-circuit because of an explicit flag.
  const r = spawnSync('sh', [SH, ...flags], {
    encoding: 'utf8',
    env: { ...process.env, ZENO_INSTALL_API_BASE: 'http://127.0.0.1:1' },
  });
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('install.sh parser', () => {
  it('rejects two target flags together', () => {
    const r = shRun('--unstable', '--branch', 'foo', '--dry-parse');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/mutually exclusive/);
  });

  it('--unstable resolves to KIND=unstable', () => {
    const r = shRun('--unstable', '--dry-parse');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('KIND=unstable');
  });

  it('--version <tag> resolves to KIND=tag with VALUE', () => {
    const r = shRun('--version', 'v2026.5.7', '--dry-parse');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('KIND=tag');
    expect(r.stdout).toContain('VALUE=v2026.5.7');
  });

  it('--branch <name> resolves to KIND=branch with VALUE', () => {
    const r = shRun('--branch', 'feat/foo', '--dry-parse');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('KIND=branch');
    expect(r.stdout).toContain('VALUE=feat/foo');
  });

  it('--pr <number> resolves to KIND=pr with VALUE', () => {
    const r = shRun('--pr', '123', '--dry-parse');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('KIND=pr');
    expect(r.stdout).toContain('VALUE=123');
  });

  it('rejects --beta (renamed to --unstable)', () => {
    const r = shRun('--beta', '--dry-parse');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/unknown flag/);
  });

  it('--version requires a value', () => {
    const r = shRun('--version', '--dry-parse');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/--version requires a value/);
  });

  it('--branch requires a value', () => {
    const r = shRun('--branch', '--dry-parse');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/--branch requires a value/);
  });

  it('--pr requires a value', () => {
    const r = shRun('--pr', '--dry-parse');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/--pr requires a value/);
  });

  it('--help prints usage and exits 0', () => {
    const r = shRun('--help');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/install.sh/);
    expect(r.stdout).toMatch(/--unstable/);
    expect(r.stdout).toMatch(/--version/);
    expect(r.stdout).toMatch(/--branch/);
    expect(r.stdout).toMatch(/--pr/);
  });

  it('default with unreachable API_BASE falls back through the chain to unstable', () => {
    // Both REST endpoints unreachable → KIND=unstable per the documented fallback.
    const r = shRun('--dry-parse');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('KIND=unstable');
  });
});

describe('install.sh corepack bootstrap', () => {
  const source = readFileSync(SH, 'utf8');

  it('does not require pnpm on the host', () => {
    expect(source).not.toMatch(/^need pnpm /m);
  });

  it('enables corepack before invoking pnpm', () => {
    expect(source).toMatch(/corepack enable/);
    const enableIdx = source.indexOf('corepack enable');
    const pnpmInstallIdx = source.indexOf('pnpm install --frozen-lockfile');
    expect(enableIdx).toBeGreaterThan(-1);
    expect(pnpmInstallIdx).toBeGreaterThan(enableIdx);
  });

  it('prepares the pnpm version parsed from package.json', () => {
    expect(source).toMatch(/corepack prepare "?pnpm@/);
    expect(source).toMatch(/parse_pnpm_version\(\)/);
  });

  it('exports COREPACK_ENABLE_DOWNLOAD_PROMPT=0 before corepack calls', () => {
    const corepackIdx = source.indexOf('corepack enable');
    const envIdx = source.indexOf('COREPACK_ENABLE_DOWNLOAD_PROMPT=0');
    expect(envIdx).toBeGreaterThan(-1);
    expect(envIdx).toBeLessThan(corepackIdx);
  });
});
