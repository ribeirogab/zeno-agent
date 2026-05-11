/**
 * Spec 0072 — pick / validate a backend slug for `zeno backend *` commands.
 *
 * Today only `claude-code` has a real driver. Future entries (codex,
 * gemini) appear in the catalog with `implemented=false`; the picker shows
 * them greyed out + disabled, and `assertBackendImplemented` hard-blocks
 * any direct usage.
 */

import type { BackendsCatalog } from '@zeno/backends';
import { c, err, isQuiet } from './output.js';
import { pick } from './picker.js';

/**
 * Backends with a real driver in this PR. When a new driver lands (codex,
 * gemini, ...) add its catalog id here.
 */
const IMPLEMENTED_BACKENDS = new Set<string>(['claude-code']);

export interface SelectableBackend {
  id: string;
  name: string;
  description: string;
  implemented: boolean;
}

export function listSelectableBackends(catalog: BackendsCatalog): SelectableBackend[] {
  return catalog.backends.map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    implemented: IMPLEMENTED_BACKENDS.has(b.id),
  }));
}

export function isBackendImplemented(slug: string): boolean {
  return IMPLEMENTED_BACKENDS.has(slug);
}

export function assertBackendImplemented(slug: string): void {
  if (!isBackendImplemented(slug)) {
    throw new Error(`${slug} backend not implemented yet`);
  }
}

const isInteractive = (): boolean => Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);

function fail(message: string): never {
  process.stderr.write(`${err(message)}\n`);
  process.exit(1);
}

export interface ResolveBackendOpts {
  /** Default target when nothing is specified and the picker is bypassed. */
  defaultSlug?: string | undefined;
}

/**
 * Resolve a backend slug. If `arg` is given, validate it against the
 * catalog and that it's implemented. Otherwise: single-backend shortcut →
 * picker → fail with a hint when non-interactive.
 */
export async function resolveBackend(
  arg: string | undefined,
  catalog: BackendsCatalog,
  opts: ResolveBackendOpts = {},
): Promise<SelectableBackend> {
  const items = listSelectableBackends(catalog);
  if (arg) {
    const found = items.find((b) => b.id === arg);
    if (!found) fail(`backend '${arg}' not in catalog`);
    if (!found.implemented) fail(`${found.id} backend not implemented yet`);
    return found;
  }

  const implemented = items.filter((b) => b.implemented);
  if (implemented.length === 1 && opts.defaultSlug === undefined) {
    return implemented[0]!;
  }
  if (opts.defaultSlug) {
    const found = items.find((b) => b.id === opts.defaultSlug);
    if (found?.implemented) return found;
  }
  if (!isInteractive()) {
    fail(`no backend specified. pass <slug> (one of: ${implemented.map((b) => b.id).join(', ')})`);
  }

  const idx = await pick(
    items.map((b) => ({
      label: b.id,
      hint: b.implemented ? b.name : `${b.name} ${c.gray('(coming soon)')}`,
      disabled: !b.implemented,
    })),
    { title: `${c.bold('select backend')}  ${c.gray('↑/↓ + Enter')}` },
  );
  if (idx === null) fail('aborted');
  const chosen = items[idx];
  if (!chosen) fail('invalid selection');
  if (!chosen.implemented) fail(`${chosen.id} backend not implemented yet`);
  if (!isQuiet()) {
    process.stdout.write(c.dim(`backend: ${chosen.id}\n`));
  }
  return chosen;
}
