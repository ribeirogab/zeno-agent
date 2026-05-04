import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Spec 0071 — atomic write of `~/.claude/.credentials.json` from the
 * decrypted DB token. The Claude Agent SDK reads this file at session start;
 * by keeping it in sync with `backend_credentials` we avoid the env-var path
 * (which would expose the token to the agent's Bash via `env | grep`).
 *
 * Atomicity: writeFile to a `.tmp` sibling, then rename. The rename is atomic
 * on POSIX — readers see either the old contents or the new, never a torn
 * write. A per-claudeHome mutex serializes concurrent writes (e.g. boot +
 * watcher firing simultaneously) so the .tmp doesn't get clobbered mid-write.
 *
 * The file mode is 0600 (owner-only RW) — defense in depth for the local FS.
 */

const mutex = new Map<string, Promise<unknown>>();

export async function materializeClaudeCredentials(opts: {
  claudeHome: string;
  oauthToken: string;
}): Promise<void> {
  const key = opts.claudeHome;
  const prev = mutex.get(key) ?? Promise.resolve();
  // Chain: each write waits for the previous to settle (success OR failure)
  // before starting. Errors don't block the next write.
  const next = prev.catch(() => undefined).then(() => doWrite(opts));
  mutex.set(
    key,
    next.catch(() => undefined),
  );
  await next;
}

async function doWrite({
  claudeHome,
  oauthToken,
}: {
  claudeHome: string;
  oauthToken: string;
}): Promise<void> {
  await mkdir(claudeHome, { recursive: true });
  const target = join(claudeHome, '.credentials.json');
  const tmp = `${target}.tmp`;
  // The SDK's credentials shape — only `accessToken` is read; the other
  // fields populated by `claude setup-token` (refreshToken, expiresAt) are
  // optional. A future spec may capture them too.
  const payload = JSON.stringify({
    claudeAiOauth: {
      accessToken: oauthToken,
    },
  });
  await writeFile(tmp, payload, { mode: 0o600 });
  await rename(tmp, target);
}
