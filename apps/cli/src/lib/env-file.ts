// Read/write .env preserving operator-edited keys, refreshing the
// CLI-managed ZENO_MASTER_KEY on every start, and ensuring the
// managed-by header is the first line.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const MANAGED_HEADER =
  '# managed by zeno CLI — manual edits to ZENO_MASTER_KEY will be overwritten on next start';
const MANAGED_KEY = 'ZENO_MASTER_KEY';

interface EnvLine {
  kind: 'header' | 'comment' | 'blank' | 'kv';
  raw: string;
  key?: string;
}

function parseEnvFile(content: string): EnvLine[] {
  return content.split('\n').map((raw) => {
    if (raw.trim() === '') return { kind: 'blank', raw };
    if (raw.trimStart().startsWith('#')) return { kind: 'comment', raw };
    const eq = raw.indexOf('=');
    if (eq <= 0) return { kind: 'comment', raw };
    const key = raw.slice(0, eq).trim();
    return { kind: 'kv', raw, key };
  });
}

function serialize(lines: EnvLine[]): string {
  let out = lines.map((l) => l.raw).join('\n');
  if (!out.endsWith('\n')) out += '\n';
  return out;
}

/**
 * Rewrite `path` so the first line is `MANAGED_HEADER` and `ZENO_MASTER_KEY`
 * matches `masterKey`. All other lines are preserved verbatim, in order.
 * Operator-added keys survive intact.
 */
export function rewriteMasterKey(path: string, masterKey: string): void {
  const content = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const parsed = parseEnvFile(content);

  // Drop any pre-existing instance of the managed header anywhere.
  const withoutHeader: EnvLine[] = parsed.filter(
    (l) => !(l.kind === 'comment' && l.raw.trim() === MANAGED_HEADER),
  );

  // Replace ZENO_MASTER_KEY line in place; if missing, append.
  let foundKey = false;
  const updated: EnvLine[] = withoutHeader.map((l) => {
    if (l.kind === 'kv' && l.key === MANAGED_KEY) {
      foundKey = true;
      return { kind: 'kv', raw: `${MANAGED_KEY}=${masterKey}`, key: MANAGED_KEY };
    }
    return l;
  });
  if (!foundKey) {
    updated.push({ kind: 'kv', raw: `${MANAGED_KEY}=${masterKey}`, key: MANAGED_KEY });
  }

  // Prepend the managed header.
  const finalLines: EnvLine[] = [
    { kind: 'header', raw: MANAGED_HEADER },
    { kind: 'blank', raw: '' },
    ...updated,
  ];

  writeFileSync(path, serialize(finalLines), 'utf8');
}

// Exported for tests.
export const __testing = { parseEnvFile, serialize, MANAGED_HEADER, MANAGED_KEY };
