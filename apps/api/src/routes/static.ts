import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';
import type { MiddlewareHandler } from 'hono';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json; charset=utf-8',
};

export function serveStaticSpa(rootDir: string): MiddlewareHandler {
  return async (c) => {
    const url = new URL(c.req.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    const candidate = join(rootDir, safe);
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      const ext = candidate.slice(candidate.lastIndexOf('.'));
      const mime = MIME[ext] ?? 'application/octet-stream';
      return c.body(readFileSync(candidate), 200, { 'Content-Type': mime });
    }
    const index = join(rootDir, 'index.html');
    if (existsSync(index)) {
      return c.body(readFileSync(index), 200, {
        'Content-Type': 'text/html; charset=utf-8',
      });
    }
    return c.text('Not Found', 404);
  };
}
