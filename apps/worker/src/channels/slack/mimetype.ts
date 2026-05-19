import { extname } from 'node:path';

const MIMETYPES: Record<string, string> = {
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.xml': 'application/xml',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.zip': 'application/zip',
};

const FALLBACK = 'application/octet-stream';

/**
 * Map a filename or path to a MIME type by its file extension.
 *
 * Case-insensitive on the extension. Unknown extensions and files
 * without an extension fall back to `application/octet-stream`.
 */
export function lookupMimetype(filename: string): string {
  const ext = extname(filename).toLowerCase();
  if (!ext) return FALLBACK;
  return MIMETYPES[ext] ?? FALLBACK;
}
