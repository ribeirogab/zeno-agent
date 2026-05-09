import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ZENO_HOME } from './paths.js';

export type VersionKind = 'tag' | 'branch' | 'pr' | 'unstable';

export interface VersionMeta {
  kind: VersionKind;
  value: string;
  sha: string;
}

const VALID_KINDS = new Set<VersionKind>(['tag', 'branch', 'pr', 'unstable']);

function metaPath(): string {
  return join(ZENO_HOME, '.installed-from');
}

export function writeMeta(meta: VersionMeta): void {
  const line = `${meta.kind}:${meta.value}@${meta.sha}\n`;
  writeFileSync(metaPath(), line, 'utf8');
}

export function readMeta(): VersionMeta | null {
  const path = metaPath();
  if (!existsSync(path)) return null;
  const line = readFileSync(path, 'utf8').trim();
  return parseMetaLine(line);
}

export function parseMetaLine(line: string): VersionMeta | null {
  const colonIdx = line.indexOf(':');
  const atIdx = line.lastIndexOf('@');
  if (colonIdx < 0 || atIdx < 0 || atIdx < colonIdx) return null;
  const kind = line.slice(0, colonIdx) as VersionKind;
  if (!VALID_KINDS.has(kind)) return null;
  const value = line.slice(colonIdx + 1, atIdx);
  const sha = line.slice(atIdx + 1);
  if (!sha) return null;
  return { kind, value, sha };
}

export function formatDisplay(meta: VersionMeta): string {
  switch (meta.kind) {
    case 'tag':
      return meta.value;
    case 'branch':
      return `branch:${meta.value} (${meta.sha})`;
    case 'pr':
      return `pr:#${meta.value} (${meta.sha})`;
    case 'unstable':
      return `unstable (${meta.sha})`;
  }
}

export function compareSemver(a: string, b: string): number {
  const ap = parseVersion(a);
  const bp = parseVersion(b);
  const len = Math.max(ap.length, bp.length);
  for (let i = 0; i < len; i++) {
    const av = ap[i] ?? 0;
    const bv = bp[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function parseVersion(v: string): number[] {
  return v
    .replace(/^v/, '')
    .split(/[.-]/)
    .map((part) => {
      const n = parseInt(part, 10);
      return Number.isNaN(n) ? 0 : n;
    });
}
