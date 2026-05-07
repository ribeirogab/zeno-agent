import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function readVersion(home: string): string {
  const path = join(home, 'package.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`zeno: cannot read ${path} (zeno-agent install corrupted; re-run install.sh)`);
  }
  const pkg = JSON.parse(raw) as { version?: string };
  if (!pkg.version) {
    throw new Error(`zeno: ${path} has no "version" field`);
  }
  return pkg.version;
}
