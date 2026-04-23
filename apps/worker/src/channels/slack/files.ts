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
 * Download Slack-hosted files to a local directory so Claude Code's
 * built-in `Read` tool can access them (images, PDFs, code, etc.).
 *
 * Each invocation writes into `<workspaceDir>/uploads/<correlationId>/`.
 * Files without a download URL or exceeding the size limit are skipped.
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

      const buffer = Buffer.from(await response.arrayBuffer());
      const localPath = join(dir, file.name);
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
