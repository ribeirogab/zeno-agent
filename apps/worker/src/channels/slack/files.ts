import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@zeno/logger';
import type { Attachment } from '@/channels/types';

const logger = createLogger({ service: 'worker' });

/** Maximum file size we'll download (50 MB). */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

export interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  size: number;
  url_private_download?: string;
  url_private?: string;
}

/**
 * Returns true when the HTTP `Content-Type` response header is compatible with
 * the file's Slack-declared mimetype. Used to detect Slack's "200 OK HTML
 * login page" response when the bot token lacks the `files:read` scope.
 *
 * Compatibility rules (intentionally loose — Slack sometimes adds `; charset=...`,
 * sometimes returns `application/octet-stream` for raw files, sometimes returns
 * the exact mimetype):
 * - Exact prefix match on the primary type (e.g., `image/` ↔ `image/png`).
 * - `application/octet-stream` is always accepted (Slack uses this for some
 *   downloads regardless of declared mimetype).
 *
 * The one case we explicitly reject is a `text/html` response when the declared
 * mimetype is NOT `text/html` — that is the Slack login-page failure mode.
 */
function isContentTypeCompatible(actualContentType: string, expectedMimetype: string): boolean {
  if (!actualContentType) {
    // No content-type header at all: do not block (some Slack CDN edges omit it).
    return true;
  }
  // Strip params like `; charset=utf-8`.
  const actual = actualContentType.split(';')[0].trim();
  const expected = expectedMimetype.toLowerCase();

  // Slack returns octet-stream for some attachment categories.
  if (actual === 'application/octet-stream') return true;

  // Exact match.
  if (actual === expected) return true;

  // Same primary type (e.g., `image/jpeg` declared, server sends `image/png`).
  const actualPrimary = actual.split('/')[0];
  const expectedPrimary = expected.split('/')[0];
  if (actualPrimary && actualPrimary === expectedPrimary) return true;

  return false;
}

/**
 * Download Slack-hosted files to a local directory so Claude Code's
 * built-in `Read` tool can access them (images, PDFs, code, etc.).
 *
 * Each invocation writes into `<workspaceDir>/uploads/<correlationId>/`.
 * Files without a download URL or exceeding the size limit are skipped.
 * Files whose download response has an incompatible Content-Type (e.g.,
 * `text/html` for an image) are also skipped — this happens when the bot
 * token lacks the `files:read` scope and Slack redirects to a login page.
 */
export async function downloadSlackFiles(
  files: SlackFile[],
  botToken: string,
  correlationId: string,
  workspaceDir: string,
): Promise<Attachment[]> {
  const dir = join(workspaceDir, 'uploads', correlationId);
  await mkdir(dir, { recursive: true });

  const attachments: Attachment[] = [];

  for (const file of files) {
    const url = file.url_private_download ?? file.url_private;
    if (!url) {
      logger.warn(
        { event: 'slack_file_no_url', fileId: file.id, fileName: file.name },
        'file has no download URL, skipping',
      );
      continue;
    }

    if (file.size > MAX_FILE_BYTES) {
      logger.warn(
        { event: 'slack_file_too_large', fileId: file.id, fileName: file.name, bytes: file.size },
        'file exceeds size limit, skipping',
      );
      continue;
    }

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${botToken}` },
      });

      if (!response.ok) {
        logger.warn(
          { event: 'slack_file_download_failed', fileId: file.id, status: response.status },
          'file download failed',
        );
        continue;
      }

      // Slack redirects unauthorized requests (bot token missing `files:read`
      // scope, expired session, etc.) to a 200 OK HTML login page instead of a
      // 401. If we trusted the status alone we'd persist HTML as `image.png`,
      // confuse the agent, and surface a downstream Anthropic 400
      // ("Could not process image"). Reject any response whose Content-Type
      // does not match the file's declared mimetype family.
      const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
      if (!isContentTypeCompatible(contentType, file.mimetype)) {
        logger.warn(
          {
            event: 'slack_file_content_type_mismatch',
            fileId: file.id,
            fileName: file.name,
            expectedMimetype: file.mimetype,
            actualContentType: contentType,
          },
          'file download returned unexpected content-type, skipping (likely auth/scope issue)',
        );
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      // Prefix the on-disk filename with the Slack file id so multiple
      // attachments in the same turn that share a name (e.g., five clipboard
      // pastes all named `image.png`) do not overwrite each other.
      // The `Attachment.name` we expose to the agent prompt stays as the
      // operator-visible original name; only the on-disk path is salted.
      const localPath = join(dir, `${file.id}-${file.name}`);
      await writeFile(localPath, buffer);

      attachments.push({
        name: file.name,
        mimetype: file.mimetype,
        localPath,
        sizeBytes: buffer.length,
      });

      logger.info(
        { event: 'slack_file_downloaded', fileId: file.id, name: file.name, bytes: buffer.length },
        'file downloaded',
      );
    } catch (error) {
      logger.warn(
        { event: 'slack_file_download_error', fileId: file.id, err: String(error).slice(0, 200) },
        'file download threw',
      );
    }
  }

  return attachments;
}
