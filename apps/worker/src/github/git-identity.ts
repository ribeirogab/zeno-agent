import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createLogger } from '@zeno/logger';
import { parse as parseYaml } from 'yaml';

const logger = createLogger({ service: 'worker' });

export interface GitIdentity {
  name: string;
  email: string;
}

const PROFILE_CANDIDATES = ['/app/profile', 'profile'];

export function parseGitIdentityFromConfig(candidates: string[] = PROFILE_CANDIDATES): GitIdentity | null {
  for (const base of candidates) {
    const path = `${base}/config.yaml`;
    if (!existsSync(path)) continue;
    try {
      const raw = readFileSync(path, 'utf8');
      const parsed = parseYaml(raw) as Record<string, unknown> | null;
      const githubApp = parsed?.github_app as Record<string, unknown> | undefined;
      const identity = githubApp?.git_identity as { name?: string; email?: string } | undefined;
      if (identity?.name && identity?.email) {
        return { name: identity.name, email: identity.email };
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function resolveGitIdentityFromGhCli(): GitIdentity | null {
  try {
    const output = execSync('gh api /user --jq \'.login,.id,.name,.email\'', {
      encoding: 'utf8',
      timeout: 10_000,
      env: process.env,
    }).trim();
    const [login, id, name, email] = output.split('\n');
    const effectiveName = name && name !== 'null' ? name : (login ?? 'unknown');
    const effectiveEmail =
      email && email !== 'null' && email !== ''
        ? email
        : `${id}+${login}@users.noreply.github.com`;
    return { name: effectiveName, email: effectiveEmail };
  } catch (error) {
    logger.warn(
      { event: 'git_identity_gh_api_failed', err: String(error).slice(0, 200) },
      'gh api /user failed, git identity fallback unavailable',
    );
    return null;
  }
}

export function resolveGitIdentity(): GitIdentity | null {
  const fromConfig = parseGitIdentityFromConfig();
  if (fromConfig) {
    logger.info(
      { event: 'git_identity_from_config', name: fromConfig.name },
      'git identity loaded from config.yaml',
    );
    return fromConfig;
  }
  const fromGh = resolveGitIdentityFromGhCli();
  if (fromGh) {
    logger.info(
      { event: 'git_identity_from_gh', name: fromGh.name },
      'git identity resolved from gh api /user',
    );
    return fromGh;
  }
  logger.warn(
    { event: 'git_identity_unavailable' },
    'no git identity resolved — commits will use container defaults',
  );
  return null;
}

export function buildGitEnv(identity: GitIdentity): Record<string, string | undefined> {
  return {
    ...process.env,
    GIT_AUTHOR_NAME: identity.name,
    GIT_COMMITTER_NAME: identity.name,
    GIT_AUTHOR_EMAIL: identity.email,
    GIT_COMMITTER_EMAIL: identity.email,
  };
}
