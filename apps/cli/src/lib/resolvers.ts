import type { ProfileRow } from '@zeno/db/host';
import { queries } from '@zeno/db/host';
import { c, err, isQuiet, statusLabel } from './output.js';
import { pick } from './picker.js';
import { resolveLiveStatus, snapshotLive } from './profile-state.js';
import { db } from './state.js';

const isInteractive = () => Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);

function fail(message: string): never {
  process.stderr.write(`${err(message)}\n`);
  process.exit(1);
}

function emitTip(line: string): void {
  if (isQuiet()) return;
  process.stdout.write(`${c.dim(line)}\n`);
}

export interface ResolveProfileOptions {
  /**
   * When `false` (the default), an explicit arg or the sticky profile shortcuts
   * the picker. Lifecycle commands (start/stop/restart/logs/open) pass `true`
   * to always show the picker when no arg is given, so the operator sees the
   * live state of every profile before acting.
   */
  ignoreSticky?: boolean;
}

export async function resolveProfile(
  arg: string | undefined,
  opts: ResolveProfileOptions = {},
): Promise<ProfileRow> {
  const conn = db();
  if (arg) {
    const p = queries.findProfile(conn, arg);
    if (!p) fail(`profile '${arg}' not found`);
    return p;
  }
  if (!opts.ignoreSticky) {
    const sticky = queries.getSticky(conn);
    if (sticky) {
      const p = queries.findProfile(conn, sticky);
      if (p) return p;
    }
  }
  const profiles = queries.listProfiles(conn);
  if (profiles.length === 0) {
    fail('no profiles. create one: zeno profile create <name>');
  }
  if (!isInteractive()) {
    fail('no profile specified. use --profile <name>');
  }
  const sticky = queries.getSticky(conn);
  // Snapshot live container state once so each picker hint reflects what the
  // operator will actually find — running `docker stop` out-of-band must not
  // leave us advertising `running` next to a dead container.
  const snap = await snapshotLive();
  const idx = await pick(
    profiles.map((p) => ({
      label: sticky === p.name ? `${p.name} *` : p.name,
      hint: statusLabel(resolveLiveStatus(p, snap)),
    })),
    { title: `${c.bold('select profile')}  ${c.gray('↑/↓ + Enter')}` },
  );
  if (idx === null) fail('aborted');
  const chosen = profiles[idx];
  if (!chosen) fail('invalid selection');
  if (!opts.ignoreSticky) {
    emitTip(`tip: zeno profile use ${chosen.name} → skip picker next time`);
  }
  return chosen;
}

export interface ConnectorListItem {
  slug: string;
  displayName?: string;
}

export interface ConnectorListSource {
  listConnectors: () => Promise<ConnectorListItem[]>;
}

export async function resolveConnector(
  arg: string | undefined,
  src: ConnectorListSource,
): Promise<string> {
  if (arg) return arg;
  if (!isInteractive()) {
    fail('no connector specified. pass <slug>');
  }
  const list = await src.listConnectors();
  if (list.length === 0) {
    fail('no connectors installed');
  }
  const idx = await pick(
    list.map((item) => ({
      label: item.slug,
      hint: item.displayName ?? '',
    })),
    { title: `${c.bold('select connector')}  ${c.gray('↑/↓ + Enter')}` },
  );
  if (idx === null) fail('aborted');
  const chosen = list[idx];
  if (!chosen) fail('invalid selection');
  return chosen.slug;
}

export interface CatalogEntry {
  id: string;
  displayName?: string;
  multiInstance?: boolean;
}

export interface CatalogSource {
  listCatalog: () => Promise<CatalogEntry[]>;
}

export async function resolveCatalog(arg: string | undefined, src: CatalogSource): Promise<string> {
  if (arg) return arg;
  if (!isInteractive()) {
    fail('no catalog id specified. pass <id>');
  }
  const list = await src.listCatalog();
  if (list.length === 0) {
    fail('catalog is empty');
  }
  const idx = await pick(
    list.map((entry) => ({
      label: entry.id,
      hint: entry.displayName ?? '',
    })),
    { title: `${c.bold('select catalog entry')}  ${c.gray('↑/↓ + Enter')}` },
  );
  if (idx === null) fail('aborted');
  const chosen = list[idx];
  if (!chosen) fail('invalid selection');
  return chosen.id;
}

export interface SecretKeyItem {
  key: string;
  label?: string;
}

export interface SecretSource {
  listSecrets: () => Promise<SecretKeyItem[]>;
}

export async function resolveSecretKey(
  arg: string | undefined,
  src: SecretSource,
): Promise<string> {
  if (arg) return arg;
  if (!isInteractive()) {
    fail('no secret key specified.');
  }
  const list = await src.listSecrets();
  if (list.length === 0) {
    fail('no secrets configured for this connector');
  }
  const idx = await pick(
    list.map((item) => ({
      label: item.key,
      hint: item.label ?? '',
    })),
    { title: `${c.bold('select secret key')}  ${c.gray('↑/↓ + Enter')}` },
  );
  if (idx === null) fail('aborted');
  const chosen = list[idx];
  if (!chosen) fail('invalid selection');
  return chosen.key;
}

export interface ToolItem {
  name: string;
  description?: string;
}

export interface ToolSource {
  listTools: () => Promise<ToolItem[]>;
}

export async function resolveTool(arg: string | undefined, src: ToolSource): Promise<string> {
  if (arg) return arg;
  if (!isInteractive()) {
    fail('no tool specified.');
  }
  const list = await src.listTools();
  if (list.length === 0) {
    fail('no tools available');
  }
  const idx = await pick(
    list.map((item) => ({
      label: item.name,
      hint: item.description ?? '',
    })),
    { title: `${c.bold('select tool')}  ${c.gray('↑/↓ + Enter')}` },
  );
  if (idx === null) fail('aborted');
  const chosen = list[idx];
  if (!chosen) fail('invalid selection');
  return chosen.name;
}

export type Permission = 'always_allow' | 'ask' | 'never';
const PERMISSIONS: Permission[] = ['always_allow', 'ask', 'never'];

export async function resolvePermission(arg: string | undefined): Promise<Permission> {
  if (arg) {
    if (!PERMISSIONS.includes(arg as Permission)) {
      throw new Error(`invalid permission '${arg}'. use one of: ${PERMISSIONS.join(', ')}`);
    }
    return arg as Permission;
  }
  if (!isInteractive()) {
    fail('no permission specified. pass one of: always_allow | ask | never');
  }
  const idx = await pick(
    PERMISSIONS.map((p) => ({ label: p, hint: '' })),
    { title: `${c.bold('select permission')}  ${c.gray('↑/↓ + Enter')}` },
  );
  if (idx === null) fail('aborted');
  const chosen = PERMISSIONS[idx];
  if (!chosen) fail('invalid selection');
  return chosen;
}

export type ToolCategory = 'read' | 'write' | 'interactive';
const TOOL_CATEGORIES: ToolCategory[] = ['read', 'write', 'interactive'];

export async function resolveToolCategory(arg: string | undefined): Promise<ToolCategory> {
  if (arg) {
    if (!TOOL_CATEGORIES.includes(arg as ToolCategory)) {
      throw new Error(`invalid category '${arg}'. use one of: ${TOOL_CATEGORIES.join(', ')}`);
    }
    return arg as ToolCategory;
  }
  if (!isInteractive()) {
    fail('no category specified. pass one of: read | write | interactive');
  }
  const idx = await pick(
    TOOL_CATEGORIES.map((cat) => ({ label: cat, hint: '' })),
    { title: `${c.bold('select category')}  ${c.gray('↑/↓ + Enter')}` },
  );
  if (idx === null) fail('aborted');
  const chosen = TOOL_CATEGORIES[idx];
  if (!chosen) fail('invalid selection');
  return chosen;
}
