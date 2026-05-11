/**
 * Spec 0071 — reads `agent/backends-catalog.json` and validates the schema.
 *
 * Backends are agent reasoning engines (Claude Code today; future Codex,
 * Gemini, etc.). Parallel to `catalog-loader.ts` (MCP connectors) and
 * `channels-catalog-loader.ts` (channels) — but distinct concept: backends
 * are the brain, not a tool surface or a transport.
 *
 * Storage of installed credentials is `backend_credentials` (encrypted KV).
 * This module only handles the catalog-file side.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

function findAgentDir(): string | null {
  if (existsSync('/app/agent')) return '/app/agent';
  if (existsSync('agent')) return 'agent';
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

export const backendAuthFieldSchema = z.object({
  field: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['password', 'text']),
  /** Optional regex (string form) for client-side format validation. */
  regex: z.string().optional(),
  regex_hint: z.string().optional(),
});

export const backendAutoFlowSchema = z.object({
  kind: z.literal('spawn-cli'),
  /** Argv to spawn — first element is the binary, rest are args. */
  command: z.array(z.string()).min(1),
  /** Regex matched against stdout to capture the device-code URL (group 1). */
  stdout_url_regex: z.string(),
  /** Regex matched against stdout to capture the final token (group 1). */
  stdout_token_regex: z.string(),
  /** Optional regex matched against stdout to detect when the CLI is waiting
   *  for the operator to paste the OAuth callback code on stdin. When matched
   *  the API emits an `awaiting_code` SSE event so the UI reveals the code
   *  input. */
  stdout_awaiting_code_regex: z.string().optional(),
});

export const backendTestSchema = z.object({
  kind: z.literal('claude-handshake'),
  model: z.string().min(1),
});

export const backendEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  description: z.string().min(1),
  logo: z.string().min(1),
  auth_schema: z.array(backendAuthFieldSchema).min(1),
  auto_flow: backendAutoFlowSchema,
  test: backendTestSchema,
  setup_doc_url: z.string().url(),
});

export const backendsCatalogFileSchema = z.object({
  backends: z.array(backendEntrySchema).min(1),
});

export type BackendCatalogEntry = z.infer<typeof backendEntrySchema>;

export interface BackendsCatalog {
  backends: BackendCatalogEntry[];
}

let cached: { mtime: number; catalog: BackendsCatalog } | null = null;

export class BackendsCatalogReadError extends Error {
  constructor(
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'BackendsCatalogReadError';
  }
}

/**
 * Read + validate the backends catalog. Cached by mtime — re-read on change.
 * Throws `BackendsCatalogReadError` on missing file or malformed content.
 */
export function loadBackendsCatalog(): BackendsCatalog {
  const agentDir = findAgentDir();
  if (!agentDir) {
    cached = null;
    throw new BackendsCatalogReadError(
      'backends catalog file not found',
      'searched /app/agent, agent (cwd), and walked up from module dir',
    );
  }
  const path = `${agentDir}/backends-catalog.json`;
  if (!existsSync(path)) {
    cached = null;
    throw new BackendsCatalogReadError('backends-catalog.json missing', `expected at ${path}`);
  }

  const mtime = (() => {
    try {
      return statSync(path).mtimeMs;
    } catch {
      return Date.now();
    }
  })();
  if (cached && cached.mtime === mtime) return cached.catalog;

  const raw = readFileSync(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new BackendsCatalogReadError('backends catalog malformed (invalid JSON)', String(err));
  }
  const result = backendsCatalogFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new BackendsCatalogReadError('backends catalog malformed (schema)', result.error.message);
  }
  const catalog: BackendsCatalog = { backends: result.data.backends };
  cached = { mtime, catalog };
  return catalog;
}

/** Test-only — clears the in-process cache so subsequent reads hit disk again. */
export function _resetBackendsCatalogCache(): void {
  cached = null;
}
