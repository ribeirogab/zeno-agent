/**
 * Generates per-command flag-table fragments under
 * `apps/docs/src/generated/cli-flags/<cmd>.mdx` from the citty `args` schemas
 * declared in `apps/cli/src/commands/<cmd>.ts`.
 *
 * Hand-written prose lives in `apps/docs/content/docs/cli.mdx`; that file
 * imports each generated fragment via Fumadocs's MDX import syntax. When a
 * flag is added or renamed in the CLI source, the next docs build picks it up
 * without anyone touching the prose page.
 *
 * The CLI command files import workspace packages (`@zeno/db/host`,
 * `../lib/orchestrator/singleton.js`) that may have module-load side effects
 * we don't want at docs-build time. Instead of dynamic-importing, we parse
 * the citty schema as static text — citty's pattern is consistent enough
 * across commands that a brace-counted object-literal extractor is reliable.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const APPS_DOCS_ROOT = path.resolve(import.meta.dirname, '..');
const REPO_ROOT = path.resolve(APPS_DOCS_ROOT, '..', '..');
const COMMANDS_DIR = path.join(REPO_ROOT, 'apps', 'cli', 'src', 'commands');
const OUT_DIR = path.join(APPS_DOCS_ROOT, 'src', 'generated', 'cli-flags');

interface ArgDef {
  type: string;
  description: string;
  default?: string;
  required?: boolean;
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  const files = (await readdir(COMMANDS_DIR)).filter((f) => f.endsWith('.ts'));
  let written = 0;
  for (const file of files) {
    const cmd = path.basename(file, '.ts');
    const source = await readFile(path.join(COMMANDS_DIR, file), 'utf8');
    const args = extractArgs(source);

    const lines: string[] = [];
    if (Object.keys(args).length === 0) {
      lines.push('_This subcommand takes no flags._');
    } else {
      lines.push('| Flag | Type | Default | Description |');
      lines.push('| --- | --- | --- | --- |');
      for (const [name, def] of Object.entries(args)) {
        const flag = def.type === 'positional' ? `\`<${name}>\`` : `\`--${name}\``;
        const dflt = def.default ?? '—';
        lines.push(`| ${flag} | ${def.type} | ${dflt} | ${def.description} |`);
      }
    }

    await writeFile(path.join(OUT_DIR, `${cmd}.mdx`), `${lines.join('\n')}\n`);
    written++;
  }
  console.log(
    `[docs:generate] wrote ${written} CLI flag fragments under ${path.relative(
      REPO_ROOT,
      OUT_DIR,
    )}`,
  );
}

/**
 * Pulls the top-level `args: { ... }` literal out of a citty command file and
 * returns each entry's type, description, default. Brace-counted to survive
 * nested objects; string-aware so braces inside strings don't fool the depth
 * counter. Fails closed (returns `{}`) if the schema isn't found.
 */
function extractArgs(source: string): Record<string, ArgDef> {
  const m = source.match(/(^|[\s,{])args:\s*\{/);
  if (!m || m.index === undefined) return {};
  const offset = m.index + m[0].length;
  const block = readBalanced(source, offset);
  if (block === null) return {};

  const entries: Record<string, ArgDef> = {};
  let pos = 0;
  while (pos < block.length) {
    while (pos < block.length && /[\s,]/.test(block[pos] ?? '')) pos++;
    if (pos >= block.length) break;
    const keyMatch = block.slice(pos).match(/^(\w+)\s*:\s*\{/);
    if (!keyMatch) break;
    const key = keyMatch[1] ?? '';
    pos += keyMatch[0].length;
    const body = readBalanced(block, pos);
    if (body === null) break;
    pos += body.length + 1; // skip body + closing `}`
    entries[key] = parseArgBody(body);
  }
  return entries;
}

/**
 * Given a string and an offset that points one past an opening `{`, returns
 * the substring up to the matching closing `}`. Skips over string literals
 * so braces inside strings don't break the depth counter.
 */
function readBalanced(source: string, start: number): string | null {
  let depth = 1;
  let i = start;
  while (i < source.length && depth > 0) {
    const c = source[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i);
    } else if (c === '"' || c === "'" || c === '`') {
      const q = c;
      i++;
      while (i < source.length && source[i] !== q) {
        if (source[i] === '\\') i++;
        i++;
      }
    }
    i++;
  }
  return null;
}

function parseArgBody(body: string): ArgDef {
  const type = body.match(/type:\s*['"](\w+)['"]/)?.[1] ?? 'unknown';
  const description = body.match(/description:\s*['"]([\s\S]*?)['"](?:,|\s*\})/)?.[1] ?? '';
  const defaultMatch = body.match(/default:\s*([^,\n}]+)/)?.[1]?.trim();
  const required = body.match(/required:\s*(true|false)/)?.[1] === 'true';
  return {
    type,
    description: description.replace(/\\'/g, "'"),
    ...(defaultMatch ? { default: defaultMatch } : {}),
    required,
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
