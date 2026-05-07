import { execSync } from 'node:child_process';
import { createLogger } from '@zeno/logger';

const logger = createLogger({ service: 'worker' });

export interface GitIdentity {
  name: string;
  email: string;
}

export function resolveGitIdentityFromGhCli(): GitIdentity | null {
  try {
    const output = execSync("gh api /user --jq '.login,.id,.name,.email'", {
      encoding: 'utf8',
      timeout: 10_000,
      env: process.env,
    }).trim();
    const [login, id, name, email] = output.split('\n');
    const effectiveName = name && name !== 'null' ? name : (login ?? 'unknown');
    const effectiveEmail =
      email && email !== 'null' && email !== '' ? email : `${id}+${login}@users.noreply.github.com`;
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
    GH_TOKEN_PERSONAL: undefined,
  };
}
