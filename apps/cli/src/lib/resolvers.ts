import type { ProfileRow } from '@zeno/db/host';
import { queries } from '@zeno/db/host';
import { c, err, isQuiet, statusLabel, type Status } from './output.js';
import { pick } from './picker.js';
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

export async function resolveProfile(arg: string | undefined): Promise<ProfileRow> {
  const conn = db();
  if (arg) {
    const p = queries.findProfile(conn, arg);
    if (!p) fail(`profile '${arg}' not found`);
    return p;
  }
  const sticky = queries.getSticky(conn);
  if (sticky) {
    const p = queries.findProfile(conn, sticky);
    if (p) return p;
  }
  const profiles = queries.listProfiles(conn);
  if (profiles.length === 0) {
    fail('no profiles. create one: zeno profile create <name>');
  }
  if (profiles.length === 1) {
    const only = profiles[0];
    if (!only) fail('no profiles');
    emitTip(`tip: zeno profile use ${only.name}`);
    return only;
  }
  if (!isInteractive()) {
    fail('no profile specified. use --profile <name>');
  }
  const idx = await pick(
    profiles.map((p) => ({
      label: p.name,
      hint: statusLabel((p.status ?? 'stopped') as Status),
    })),
    { title: `${c.bold('select profile')}  ${c.gray('↑/↓ + Enter')}` },
  );
  if (idx === null) fail('aborted');
  const chosen = profiles[idx];
  if (!chosen) fail('invalid selection');
  emitTip(`tip: zeno profile use ${chosen.name} → skip picker next time`);
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

export async function resolveCatalog(
  arg: string | undefined,
  src: CatalogSource,
): Promise<string> {
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
