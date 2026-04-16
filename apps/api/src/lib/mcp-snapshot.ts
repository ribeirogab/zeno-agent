import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type McpStatus = 'enabled' | 'disabled' | 'skipped';

export interface McpSnapshotEntry {
  name: string;
  status: McpStatus;
  reason?: string;
}

interface FileEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  _disabled?: boolean;
}

interface FileShape {
  mcpServers?: Record<string, FileEntry>;
}

const ENV_VAR_PATTERN = /\$\{([A-Z0-9_]+)\}/g;

/**
 * Scan an env map for the first ${VAR} reference that is missing from process.env.
 * Returns the missing variable name, or null if all references resolve.
 *
 * Uses String.prototype.matchAll to avoid the stateful `lastIndex` gotcha of
 * calling RegExp.exec on a shared /g regex across multiple inputs.
 */
function missingEnvVar(env: Record<string, string> | undefined): string | null {
  if (!env) return null;
  for (const value of Object.values(env)) {
    for (const match of value.matchAll(ENV_VAR_PATTERN)) {
      const varName = match[1];
      if (!varName) continue;
      const resolved = process.env[varName];
      if (resolved === undefined || resolved === '') {
        return varName;
      }
    }
  }
  return null;
}

/**
 * Read `profileDir/mcp.json` and classify each declared server as
 * enabled, disabled (explicit `_disabled: true`), or skipped (missing env var).
 * Returns an empty list when the file is absent or malformed — this helper
 * is for read-only dashboard display, never fatal.
 */
export function mcpSnapshot(profileDir: string): McpSnapshotEntry[] {
  const path = join(profileDir, 'mcp.json');
  if (!existsSync(path)) return [];

  let parsed: FileShape;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as FileShape;
  } catch {
    return [];
  }

  const out: McpSnapshotEntry[] = [];
  for (const [name, entry] of Object.entries(parsed.mcpServers ?? {})) {
    if (entry._disabled) {
      out.push({ name, status: 'disabled' });
      continue;
    }
    const missing = missingEnvVar(entry.env);
    if (missing) {
      out.push({ name, status: 'skipped', reason: `missing env: ${missing}` });
      continue;
    }
    out.push({ name, status: 'enabled' });
  }
  return out;
}
