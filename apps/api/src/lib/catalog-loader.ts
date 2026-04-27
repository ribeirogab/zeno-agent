/**
 * Reads the curated connector catalog from `agent/connectors-catalog.json`.
 * Spec 0034.
 */

import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';

const AGENT_CANDIDATES = ['/app/agent', 'agent'];

export const catalogSecretSchema = z.object({
  key: z.string(),
  label: z.string(),
  help: z.string(),
  required: z.boolean(),
  /**
   * Optional rendering hint for the install modal. Spec 0042.
   * - `password` (default): masked single-line input
   * - `text`: visible single-line input
   * - `pem`: textarea + file picker that loads file content into textarea
   */
  inputType: z.enum(['text', 'password', 'pem']).optional(),
});

export const catalogToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  category: z.enum(['read', 'write', 'interactive']),
  defaultPermission: z.enum(['always_allow', 'ask', 'never']),
});

export const catalogTransportConfigSchema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().optional(),
});

export const catalogEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string(),
  description: z.string(),
  icon: z.string(),
  docsUrl: z.string(),
  transport: z.enum(['stdio', 'remote']),
  transportConfig: catalogTransportConfigSchema,
  secrets: z.array(catalogSecretSchema),
  tools: z.array(catalogToolSchema),
  /**
   * Optional name of a tool the test endpoints can call to verify credentials
   * are valid. `tools/list` alone often returns success regardless of token —
   * calling a real tool is the only deterministic auth check. Spec 0038 F#2.
   */
  authCheckTool: z.string().optional(),
  /**
   * Optional arguments to pass to the auth-check tool. Some MCPs (e.g. Klaviyo)
   * require a non-empty argument shape on every tool call. Without this, the
   * call returns a validation error and the auth check misclassifies. Spec 0040.
   */
  authCheckArgs: z.record(z.string(), z.unknown()).optional(),
  /**
   * Optional id of a custom install component registered in the dashboard.
   * When set, the install modal renders that component instead of the default
   * secret-fields layout. Spec 0042 (used by `github-app`).
   */
  customInstallComponent: z.string().optional(),
  /**
   * Spec 0048 Q1: optional per-prefix tool-category override. Used by MCPs
   * whose tool-name convention doesn't match the default read_/list_/get_/etc.
   * prefixes (e.g., Klaviyo prefixes everything `klaviyo_*`). The discovery
   * layer + catalog regenerator consult this map BEFORE falling through to
   * the default `classifyToolCategory` heuristic.
   */
  categoryPrefixMap: z.record(z.string(), z.enum(['read', 'write', 'interactive'])).optional(),
  tags: z.array(z.string()).optional(),
});

export const catalogFileSchema = z.object({
  version: z.number(),
  connectors: z.array(catalogEntrySchema),
});

export type CatalogEntry = z.infer<typeof catalogEntrySchema>;

function findCatalogFile(): string | null {
  for (const base of AGENT_CANDIDATES) {
    const path = `${base}/connectors-catalog.json`;
    if (existsSync(path)) return path;
  }
  return null;
}

let cached: { mtime: number; entries: CatalogEntry[] } | null = null;

export class CatalogReadError extends Error {
  constructor(
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'CatalogReadError';
  }
}

/**
 * Read + validate the catalog. Throws `CatalogReadError` on missing file or
 * malformed content. Cached in-process by mtime — re-read if the file changes.
 */
export function loadCatalog(): CatalogEntry[] {
  const path = findCatalogFile();
  if (!path) {
    cached = null;
    throw new CatalogReadError('catalog file not found', `searched ${AGENT_CANDIDATES.join(', ')}`);
  }
  const stats = (() => {
    try {
      // dynamic require to avoid extra import overhead
      // biome-ignore lint/style/useNodejsImportProtocol: keep import inline for catalog-only use
      const { statSync } = require('fs') as typeof import('node:fs');
      return statSync(path);
    } catch {
      return null;
    }
  })();
  const mtime = stats?.mtimeMs ?? Date.now();
  if (cached && cached.mtime === mtime) return cached.entries;

  const raw = readFileSync(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new CatalogReadError('catalog malformed (invalid JSON)', String(err));
  }
  const result = catalogFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new CatalogReadError('catalog malformed (schema)', result.error.message);
  }
  cached = { mtime, entries: result.data.connectors };
  return result.data.connectors;
}

export function findCatalogEntry(id: string): CatalogEntry | null {
  const entries = loadCatalog();
  return entries.find((e) => e.id === id) ?? null;
}

export function resolveIconPath(filename: string): string | null {
  for (const base of AGENT_CANDIDATES) {
    const path = `${base}/assets/connectors/${filename}`;
    if (existsSync(path)) return path;
  }
  return null;
}
