/**
 * Spec 0057: reads the curated channels catalog from `agent/channels-catalog.json`.
 * Parallel to `catalog-loader.ts` (which loads MCP connectors) — channels are
 * transports the agent runs INSIDE of (Slack, future Telegram/WhatsApp), vs.
 * MCP connectors which expose tools the agent CALLS.
 *
 * Storage of installed channels is shared with MCP connectors (`connectors`
 * table with `kind='channel'`). This module only handles the catalog-file side.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Search candidates for `agent/channels-catalog.json`:
 * 1. `/app/agent` — Docker container (mounted from worktree root)
 * 2. `agent` — local dev when CWD is worktree root
 * 3. walk up from this module's directory looking for `agent/channels-catalog.json`
 *    — handles tests run from package subdirectories (apps/api, etc.)
 *
 * NOTE: do NOT use the global `__dirname` here — this file is compiled to ESM,
 * where `__dirname` is undefined and reading it throws `ReferenceError`. The
 * `import.meta.url + fileURLToPath` path is the ESM-correct equivalent.
 */
function findAgentDir(): string | null {
  if (existsSync('/app/agent')) return '/app/agent';
  if (existsSync('agent')) return 'agent';
  // Walk up from this module's location until we find `agent/`
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    const candidate = resolve(dir, 'agent');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export const channelSecretSchema = z.object({
  key: z.string(),
  label: z.string(),
  help: z.string(),
  required: z.boolean(),
  /** Optional rendering hint for the install modal. Mirrors catalog-loader convention. */
  inputType: z.enum(['text', 'password', 'pem']).optional(),
});

export const channelEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  /** Slug used to look up installed rows in the connectors table (and as a stable identifier across UI/API). Must equal `id` in current schema; may diverge in the future if catalog ids ever need to differ from slugs. */
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string(),
  description: z.string(),
  icon: z.string(),
  docsUrl: z.string(),
  secrets: z.array(channelSecretSchema),
});

export const channelsCatalogFileSchema = z.object({
  version: z.number(),
  channels: z.array(channelEntrySchema),
});

export type ChannelCatalogEntry = z.infer<typeof channelEntrySchema>;

/** What `loadChannelsCatalog` returns + helper methods bind to. Channels are stored as a list (not a map) so the catalog file is the canonical order. */
export interface ChannelsCatalog {
  entries: ChannelCatalogEntry[];
}

function findCatalogFile(): string | null {
  const agentDir = findAgentDir();
  if (!agentDir) return null;
  const path = `${agentDir}/channels-catalog.json`;
  if (existsSync(path)) return path;
  return null;
}

let cached: { mtime: number; catalog: ChannelsCatalog } | null = null;

export class ChannelsCatalogReadError extends Error {
  constructor(
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'ChannelsCatalogReadError';
  }
}

/**
 * Read + validate the channels catalog. Throws `ChannelsCatalogReadError` on
 * missing file or malformed content. Cached in-process by mtime — re-read if
 * the file changes (mirrors `catalog-loader.ts` behavior).
 */
export function loadChannelsCatalog(): ChannelsCatalog {
  const path = findCatalogFile();
  if (!path) {
    cached = null;
    throw new ChannelsCatalogReadError(
      'channels catalog file not found',
      'searched /app/agent, agent (cwd), and walked up from module dir',
    );
  }
  const stats = (() => {
    try {
      // biome-ignore lint/style/useNodejsImportProtocol: keep import inline for catalog-only use
      const { statSync } = require('fs') as typeof import('node:fs');
      return statSync(path);
    } catch {
      return null;
    }
  })();
  const mtime = stats?.mtimeMs ?? Date.now();
  if (cached && cached.mtime === mtime) return cached.catalog;

  const raw = readFileSync(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ChannelsCatalogReadError('channels catalog malformed (invalid JSON)', String(err));
  }
  const result = channelsCatalogFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new ChannelsCatalogReadError('channels catalog malformed (schema)', result.error.message);
  }
  cached = { mtime, catalog: { entries: result.data.channels } };
  return cached.catalog;
}

export function findChannelCatalogEntry(
  catalog: ChannelsCatalog,
  id: string,
): ChannelCatalogEntry | null {
  return catalog.entries.find((e) => e.id === id) ?? null;
}

/** For tests: reset the module-level cache. */
export function _resetChannelsCatalogCache(): void {
  cached = null;
}
