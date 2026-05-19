#!/usr/bin/env node
/**
 * Regenerate the connectors-catalog snapshot used by spec 0037 P1.5.
 *
 * Usage:
 *   node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs
 *     ↳ mirror-only mode: reads `agent/connectors-catalog.json`, projects each
 *       entry's tools[] into a stable JSON shape, writes the snapshot.
 *
 *   node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs --fetch-from-mcp
 *     ↳ live-fetch mode (added by spec 0038): for each catalog entry, calls
 *       discoverTools against the live MCP using a token from env (env var name
 *       is the `key` field of the first required secret of the catalog entry —
 *       e.g. SENTRY_ACCESS_TOKEN for sentry), overwrites the catalog's tools[]
 *       with the live result, then mirrors to the snapshot.
 *
 * Convention (env-var derivation): the env var name equals the `key` field of
 * the first required `secrets[]` entry of the catalog entry. For Sentry that
 * is `SENTRY_ACCESS_TOKEN`. If a future catalog entry has multiple required
 * secrets or unusual ordering, this convention may need to be revisited;
 * today the rule is simple and unambiguous because all entries are
 * single-required-secret.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../../..');
const CATALOG_PATH = resolve(REPO_ROOT, 'agent/connectors-catalog.json');
const SNAPSHOT_PATH = resolve(
  REPO_ROOT,
  'apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap',
);

function categoryDefault(category) {
  if (category === 'read') return 'always_allow';
  if (category === 'write') return 'ask';
  if (category === 'interactive') return 'ask';
  throw new Error(`unknown category: ${category}`);
}

function projectTool(tool) {
  return {
    name: tool.name,
    category: tool.category,
    defaultPermission: tool.defaultPermission,
  };
}

function compareTools(a, b) {
  const cat = a.category.localeCompare(b.category);
  return cat !== 0 ? cat : a.name.localeCompare(b.name);
}

async function readCatalog() {
  const raw = await readFile(CATALOG_PATH, 'utf8');
  return JSON.parse(raw);
}

async function writeCatalog(catalog) {
  await writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2) + '\n');
}

async function writeSnapshot(catalog) {
  const snapshot = {};
  for (const entry of catalog.connectors) {
    snapshot[entry.id] = (entry.tools ?? []).map(projectTool).sort(compareTools);
  }
  await writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + '\n');
}

async function fetchToolsFromLiveMcp(catalog) {
  // Lazy-import discoverTools from @zeno/mcp-discover. It's a workspace dep
  // of @zeno/worker, so this script (running under apps/worker) can resolve it.
  const { discoverTools } = await import('@zeno/mcp-discover');

  for (const entry of catalog.connectors) {
    const required = (entry.secrets ?? []).find((s) => s.required);
    if (!required) {
      console.error(
        `skip ${entry.id}: no required secret (cannot derive env var name)`,
      );
      continue;
    }
    const envName = required.key;
    const value = process.env[envName];
    if (!value) {
      console.warn(
        `skip ${entry.id}: missing env var ${envName} (set it to fetch tools for this entry)`,
      );
      continue;
    }

    console.log(`fetching tools from live MCP for ${entry.id}...`);

    const transient = {
      id: 'transient',
      slug: entry.id,
      displayName: entry.name,
      description: entry.description,
      source: 'catalog',
      catalogId: entry.id,
      transport: entry.transport,
      command: entry.transportConfig?.command ?? null,
      args: entry.transportConfig?.args ?? null,
      url: entry.transportConfig?.url ?? null,
      status: 'pending',
      lastError: null,
      lastErrorAt: null,
      lastVerifiedAt: null,
      createdAt: '',
      updatedAt: '',
    };
    const secrets = [{ connectorId: 'transient', key: envName, value }];

    const options = {};
    if (entry.authCheckTool) options.authCheckTool = entry.authCheckTool;
    if (entry.authCheckArgs) options.authCheckArgs = entry.authCheckArgs;
    if (entry.categoryPrefixMap) options.categoryPrefixMap = entry.categoryPrefixMap;
    const result = await discoverTools(transient, secrets, options);
    if ('error' in result) {
      throw new Error(`discoverTools failed for ${entry.id}: ${result.error}`);
    }

    const projected = result.tools
      .map((t) => ({
        name: t.name,
        description: shortDescription(t.description),
        category: t.category,
        defaultPermission: categoryDefault(t.category),
      }))
      .sort(compareTools);

    entry.tools = projected;
    console.log(`  ${entry.id}: ${projected.length} tools updated`);
  }
}

function shortDescription(d) {
  if (!d) return '';
  // First sentence or first newline, whichever comes first.
  const idx = (() => {
    const periods = d.indexOf('. ');
    const newline = d.indexOf('\n');
    if (periods === -1) return newline;
    if (newline === -1) return periods;
    return Math.min(periods, newline);
  })();
  if (idx === -1) return d.trim();
  return (d.slice(0, idx).replace(/\.+$/, '') + '.').trim();
}

async function main() {
  const args = process.argv.slice(2);
  const fetchFromMcp = args.includes('--fetch-from-mcp');

  const catalog = await readCatalog();

  if (fetchFromMcp) {
    await fetchToolsFromLiveMcp(catalog);
    await writeCatalog(catalog);
  }

  await writeSnapshot(catalog);
  console.log(
    `snapshot written: ${SNAPSHOT_PATH.replace(REPO_ROOT + '/', '')}`,
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
