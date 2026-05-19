import { lstat, readdir, realpath, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createLogger } from '@zeno/logger';
import { lookupMimetype } from '@/channels/slack/mimetype';
import type { OutgoingAttachment } from '@/channels/types';

const logger = createLogger({ service: 'worker' });

/** Maximum file size we'll upload (50 MB). Mirrors inbound MAX_FILE_BYTES. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/**
 * Enumerate files the agent wrote into the per-turn outbox directory.
 *
 * Shallow `readdir` only — subdirectories are skipped, not recursed.
 * Symlinks whose realpath escapes the outbox are skipped (defense against
 * an agent trying to leak host files via the upload surface; the agent is
 * already sandboxed in Docker but this is belt-and-suspenders).
 * Files larger than 50 MB are skipped with a warn log; the agent's reply
 * still goes through with whatever else was in the outbox.
 *
 * Missing outbox directory returns `[]` (caller may have failed `mkdir`).
 */
export async function collectOutbox(outboxDir: string): Promise<OutgoingAttachment[]> {
  let entries: string[];
  try {
    entries = await readdir(outboxDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const root = resolve(outboxDir);
  const attachments: OutgoingAttachment[] = [];

  for (const name of entries.sort()) {
    const path = join(outboxDir, name);
    const lst = await lstat(path);

    if (lst.isDirectory()) {
      logger.warn(
        { event: 'outbox_subdir_skipped', name, path },
        'outbox subdirectory skipped (not recursed)',
      );
      continue;
    }

    if (lst.isSymbolicLink()) {
      const real = resolve(await realpath(path));
      if (!real.startsWith(`${root}/`) && real !== root) {
        logger.warn(
          { event: 'outbox_symlink_skipped', name, path },
          'outbox symlink points outside dir; skipped',
        );
        continue;
      }
    }

    const st = await stat(path);
    if (!st.isFile()) continue;

    if (st.size > MAX_FILE_BYTES) {
      logger.warn(
        { event: 'outbox_file_too_large', name, path, bytes: st.size },
        'outbox file exceeds 50 MB; skipped',
      );
      continue;
    }

    attachments.push({
      name,
      mimetype: lookupMimetype(name),
      localPath: path,
      sizeBytes: st.size,
    });
  }

  return attachments;
}
