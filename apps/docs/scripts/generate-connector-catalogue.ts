/**
 * Generates `apps/docs/content/docs/connector-catalogue.mdx` from
 * `agent/connectors-catalog.json` so the docs catalogue is always in lockstep
 * with the runtime catalogue. Iterates the JSON entries (NOT the asset
 * directory) so stray icon files like `slack.svg` (no matching catalog entry)
 * never produce phantom cards.
 *
 * Build wiring: invoked by `pnpm run docs:generate`, which runs before
 * `fumadocs-mdx` so the generated MDX is visible to the source-map step.
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const APPS_DOCS_ROOT = path.resolve(import.meta.dirname, '..');
const REPO_ROOT = path.resolve(APPS_DOCS_ROOT, '..', '..');
const CATALOG_JSON = path.join(REPO_ROOT, 'agent', 'connectors-catalog.json');
const ICONS_SOURCE_DIR = path.join(REPO_ROOT, 'agent', 'assets', 'connectors');
const ICONS_DEST_DIR = path.join(APPS_DOCS_ROOT, 'public', 'connector-icons');
const OUT_PATH = path.join(APPS_DOCS_ROOT, 'content', 'docs', 'connector-catalogue.mdx');

interface ConnectorEntry {
  id: string;
  name: string;
  description: string;
  icon?: string;
  docsUrl?: string;
  tags?: string[];
}

interface Catalog {
  connectors: ConnectorEntry[];
}

async function main(): Promise<void> {
  const raw = await readFile(CATALOG_JSON, 'utf8');
  const catalog: Catalog = JSON.parse(raw);

  await mkdir(ICONS_DEST_DIR, { recursive: true });
  await mkdir(path.dirname(OUT_PATH), { recursive: true });

  for (const c of catalog.connectors) {
    if (!c.icon) continue;
    const src = path.join(ICONS_SOURCE_DIR, c.icon);
    const dest = path.join(ICONS_DEST_DIR, c.icon);
    try {
      await copyFile(src, dest);
    } catch (e) {
      throw new Error(
        `connector "${c.id}" references icon "${c.icon}" but ${src} is missing — fix the catalog or ship the asset.`,
        { cause: e },
      );
    }
  }

  const lines: string[] = [];
  lines.push('---');
  lines.push('title: Connector catalogue');
  lines.push(
    'description: Every connector that ships in the Zeno dashboard today, generated from the runtime catalogue.',
  );
  lines.push('---');
  lines.push('');
  lines.push(
    "These are the connectors a fresh Zeno install offers under the dashboard's `/connectors` route. The list is generated from `agent/connectors-catalog.json` at docs build time, so it is always in lockstep with what an operator actually sees in their dashboard.",
  );
  lines.push('');
  lines.push(
    'A connector is an MCP server the worker spawns on demand — see [Connectors](/connectors) for the concept.',
  );
  lines.push('');

  lines.push('<div className="not-prose grid gap-4 sm:grid-cols-2 mt-8">');
  for (const c of catalog.connectors) {
    const iconPath = c.icon ? `/connector-icons/${c.icon}` : null;
    lines.push(
      `  <div className="rounded-lg border border-fd-border bg-fd-card p-4 flex flex-col gap-2">`,
    );
    lines.push('    <div className="flex items-center gap-3">');
    if (iconPath) {
      lines.push(`      <img src="${iconPath}" alt="${c.name} logo" className="w-8 h-8" />`);
    }
    lines.push(`      <div>`);
    lines.push(
      `        <div className="font-medium text-fd-foreground">${escapeHtml(c.name)}</div>`,
    );
    lines.push(`        <code className="text-xs text-fd-muted-foreground">${c.id}</code>`);
    lines.push(`      </div>`);
    lines.push('    </div>');
    lines.push(
      `    <p className="text-sm text-fd-muted-foreground">${escapeHtml(c.description)}</p>`,
    );
    if (c.docsUrl) {
      lines.push(
        `    <a href="${c.docsUrl}" className="text-sm text-fd-foreground underline" target="_blank" rel="noreferrer">Upstream docs ↗</a>`,
      );
    }
    lines.push('  </div>');
  }
  lines.push('</div>');
  lines.push('');

  await writeFile(OUT_PATH, lines.join('\n'));
  console.log(`[docs:generate] wrote ${path.relative(REPO_ROOT, OUT_PATH)}`);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
