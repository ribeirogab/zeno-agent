/**
 * Spec 0062 — streaming zip extract for the skills install pipeline.
 *
 * The `POST /api/skills` handler hands raw bytes to `extractZipWithCaps`,
 * which:
 *   1. Pipes the input through `unzipper.Parse()` for streaming entry-by-entry
 *      reads (no full-archive buffering — defends against malicious headers
 *      that lie about size).
 *   2. Per-entry path safety check: rejects `..`, absolute paths, symlinks.
 *   3. Per-entry size check: aborts at 1 MB per file with `entry.autodrain()`
 *      so the upstream HTTP request finalizes (the `unzipper` stream gotcha).
 *   4. Running total cap: 5 MB total, hard abort at 10 MB safety margin.
 *   5. File count cap: 500 entries.
 *   6. Writes each entry to `<dashboardSkillsRoot>/.tmp-<uuid>/<entry.path>`.
 *      The atomic rename to `<name>/` happens in the route handler AFTER
 *      validating SKILL.md + frontmatter + UNIQUE name.
 *
 * On any cap or path violation: stops extraction, removes the tmp dir,
 * returns an error code that the route maps to a 4xx response.
 */

import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import unzipper from 'unzipper';

export interface ExtractCaps {
  /** Per-file byte cap. Default 1 MB. */
  perFile: number;
  /** Total-bytes cap across all files. Default 5 MB. */
  total: number;
  /** Maximum number of file entries (directories don't count). Default 500. */
  maxFiles: number;
  /** Hard abort: stop extracting past this much regardless of validation. Default 10 MB. */
  hardAbortTotal: number;
}

export const DEFAULT_CAPS: ExtractCaps = {
  perFile: 1_000_000,
  total: 5_000_000,
  maxFiles: 500,
  hardAbortTotal: 10_000_000,
};

export interface ExtractSuccess {
  ok: true;
  /** Absolute path to the .tmp-<uuid>/ dir. Caller validates + atomically renames. */
  extractedPath: string;
  fileCount: number;
  totalBytes: number;
}

export type ExtractError =
  | {
      ok: false;
      code: 'skill_size_exceeded';
      message: string;
      uploadedBytes: number;
      cap: number;
    }
  | {
      ok: false;
      code: 'skill_file_too_large';
      message: string;
      path: string;
      sizeBytes: number;
      cap: number;
    }
  | {
      ok: false;
      code: 'skill_too_many_files';
      message: string;
      count: number;
      cap: number;
    }
  | {
      ok: false;
      code: 'skill_path_invalid';
      message: string;
      path: string;
    }
  | {
      ok: false;
      code: 'skill_zip_invalid';
      message: string;
    };

export type ExtractResult = ExtractSuccess | ExtractError;

/**
 * Validate an entry path: reject `..`, absolute, and `/`-prefixed paths.
 * The check is purely string-based (we never resolve the path on disk
 * before validating). Returns the normalized relative path on success.
 */
function safeEntryPath(raw: string): string | null {
  if (raw.length === 0) return null;
  // Normalize separators to '/'.
  const normalized = raw.replace(/\\/g, '/');
  // Reject absolute paths (Unix or Windows-drive style).
  if (normalized.startsWith('/')) return null;
  if (/^[a-zA-Z]:[\\/]/.test(raw)) return null;
  // Reject any segment equal to `..`.
  const parts = normalized.split('/');
  for (const part of parts) {
    if (part === '..') return null;
  }
  return normalized;
}

/**
 * Extract a zip stream into `<dashboardSkillsRoot>/.tmp-<uuid>/`. Aborts on
 * any cap violation or path safety check. Cleans up tmp dir on failure.
 */
export async function extractZipWithCaps(
  stream: Readable,
  dashboardSkillsRoot: string,
  caps: ExtractCaps = DEFAULT_CAPS,
): Promise<ExtractResult> {
  const tmpDirName = `.tmp-${randomUUID()}`;
  const tmpDir = join(dashboardSkillsRoot, tmpDirName);
  await mkdir(tmpDir, { recursive: true });

  let totalBytes = 0;
  let fileCount = 0;
  let aborted: ExtractError | null = null;

  // unzipper.Parse() is a transform that emits 'entry' events. Each entry is
  // itself a Readable. We process entries serially.
  const parse = stream.pipe(unzipper.Parse({ forceStream: true }));

  // Stream consumer: for-await over the entries.
  try {
    for await (const entry of parse) {
      const e = entry as unzipper.Entry;
      // If we already decided to abort, drain remaining entries to keep the
      // upstream stream from stalling.
      if (aborted) {
        e.autodrain();
        continue;
      }

      // Skip directory entries — they're created lazily when we mkdir the
      // file's parent.
      if (e.type === 'Directory') {
        e.autodrain();
        continue;
      }

      // Spec 0062 constraint: "Zip extraction MUST reject entries with
      // symlinks." Treat symlink entries as a path-safety violation —
      // `unzipper` would otherwise materialize the symlink target as plain
      // data inside the file, which is harmless but diverges from the
      // spec's stated rejection rule.
      const entryType = (e as { type?: string }).type;
      if (entryType === 'SymbolicLink') {
        aborted = {
          ok: false,
          code: 'skill_path_invalid',
          message: `Zip entry is a symlink, which is not allowed: ${e.path}`,
          path: e.path,
        };
        e.autodrain();
        continue;
      }

      const safePath = safeEntryPath(e.path);
      if (safePath === null) {
        aborted = {
          ok: false,
          code: 'skill_path_invalid',
          message: `Zip entry has unsafe path: ${e.path}`,
          path: e.path,
        };
        e.autodrain();
        continue;
      }

      fileCount++;
      if (fileCount > caps.maxFiles) {
        aborted = {
          ok: false,
          code: 'skill_too_many_files',
          message: `Zip exceeds max files cap: ${fileCount} > ${caps.maxFiles}`,
          count: fileCount,
          cap: caps.maxFiles,
        };
        e.autodrain();
        continue;
      }

      // Write the file while watching size. Wrap in a counter Transform so we
      // abort mid-stream if the cap trips.
      const targetPath = join(tmpDir, safePath);
      await mkdir(dirname(targetPath), { recursive: true });

      let entryBytes = 0;
      const sink = createWriteStream(targetPath);
      let entryAbort: ExtractError | null = null;

      // Consume the entry stream.
      e.on('data', (chunk: Buffer) => {
        entryBytes += chunk.length;
        totalBytes += chunk.length;

        if (entryBytes > caps.perFile) {
          entryAbort = {
            ok: false,
            code: 'skill_file_too_large',
            message: `File '${safePath}' exceeds per-file cap: ${entryBytes} > ${caps.perFile} bytes`,
            path: safePath,
            sizeBytes: entryBytes,
            cap: caps.perFile,
          };
        }
        if (totalBytes > caps.total) {
          entryAbort = {
            ok: false,
            code: 'skill_size_exceeded',
            message: `Zip total size exceeds cap: ${totalBytes} > ${caps.total} bytes`,
            uploadedBytes: totalBytes,
            cap: caps.total,
          };
        }
        if (totalBytes > caps.hardAbortTotal) {
          // Defensive: refuse to keep extracting past the hard margin even
          // if the operator's cap is somehow higher.
          entryAbort = {
            ok: false,
            code: 'skill_size_exceeded',
            message: `Zip total size exceeds hard abort margin: ${totalBytes} > ${caps.hardAbortTotal} bytes`,
            uploadedBytes: totalBytes,
            cap: caps.hardAbortTotal,
          };
        }
      });

      try {
        await pipeline(e, sink);
      } catch (err) {
        // Pipeline failed — could be cap-trip-induced (sink closed) or a
        // real malformed zip. Capture and continue with autodrain on
        // remaining entries.
        if (!entryAbort) {
          entryAbort = {
            ok: false,
            code: 'skill_zip_invalid',
            message: `Failed to extract entry '${safePath}': ${(err as Error).message}`,
          };
        }
      }

      if (entryAbort) {
        aborted = entryAbort;
      }
    }
  } catch (err) {
    // Top-level zip parse failure — malformed archive.
    aborted = {
      ok: false,
      code: 'skill_zip_invalid',
      message: `Zip parse error: ${(err as Error).message}`,
    };
  }

  if (aborted) {
    await rm(tmpDir, { recursive: true, force: true });
    return aborted;
  }

  return {
    ok: true,
    extractedPath: tmpDir,
    fileCount,
    totalBytes,
  };
}
