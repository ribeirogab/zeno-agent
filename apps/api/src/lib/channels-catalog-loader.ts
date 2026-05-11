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

/**
 * Spec 2026-05-11: a `field` is the canonical unit for both secrets and non-secret
 * configuration. `public: true` means the value is stored unmasked (`connector_secrets.is_public=1`)
 * and rendered without redaction on GET; `public: false` means the value is masked on read
 * and prompted with hidden input by the CLI.
 */
export const channelFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  help: z.string(),
  required: z.boolean(),
  public: z.boolean(),
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
  /** Transport discriminator (e.g. `socket-mode`). Drives adapter wiring in the worker. */
  transport: z.string(),
  /** Probe strategy id resolved by `runTestStrategy()` in the worker (e.g. `slack_auth_test`). */
  testStrategy: z.string(),
  fields: z.array(channelFieldSchema),
});

export const channelsCatalogFileSchema = z.object({
  version: z.number(),
  channels: z.array(channelEntrySchema),
});

export type ChannelField = z.infer<typeof channelFieldSchema>;
export type ChannelCatalogEntry = z.infer<typeof channelEntrySchema>;

/**
 * What `loadChannelsCatalog` returns + helper methods bind to. Channels are stored as a
 * list (not a map) so the catalog file is the canonical order. `findField` is a fast lookup
 * the API gate handler uses to resolve `public` per submitted key on PATCH /:slug/secrets.
 */
export interface ChannelsCatalog {
  entries: ChannelCatalogEntry[];
  findField(catalogId: string, key: string): ChannelField | undefined;
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
  const entries = result.data.channels;
  // Index `<catalogId, <key, field>>` so `findField` is O(1). Catalog is small, but
  // PATCH /:slug/secrets calls this once per submitted key — Map beats nested .find() scans.
  const fieldIndex = new Map<string, Map<string, ChannelField>>();
  for (const entry of entries) {
    const inner = new Map<string, ChannelField>();
    for (const field of entry.fields) inner.set(field.key, field);
    fieldIndex.set(entry.id, inner);
  }
  cached = {
    mtime,
    catalog: {
      entries,
      findField(catalogId, key) {
        return fieldIndex.get(catalogId)?.get(key);
      },
    },
  };
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
