import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';

const TRACKED_FILES = ['SOUL.md', 'USER.md', 'crons.yaml'] as const;

// Spec 0067 C: CommandRepo dep removed alongside the Restart Worker
// route. Re-add when a settings action needs to enqueue commands again.
export interface SettingsRouteDeps {
  profileDir: string;
}

interface ProfileFile {
  path: string;
  bytes: number;
  mtime: string;
}

interface ProfileInfo {
  name: string | null;
  slug: string;
}

function readProfileFiles(profileDir: string): ProfileFile[] {
  const out: ProfileFile[] = [];
  for (const name of TRACKED_FILES) {
    const abs = join(profileDir, name);
    if (!existsSync(abs)) continue;
    const stat = statSync(abs);
    out.push({ path: name, bytes: stat.size, mtime: stat.mtime.toISOString() });
  }
  return out;
}

/**
 * Spec 0066 A: parse the operator name from USER.md.
 *
 * Two acceptable formats — operators write USER.md in either style:
 *
 * 1. **YAML frontmatter** (e.g. profiles/default/USER.example.md):
 *    ```
 *    ---
 *    name: Operator
 *    ---
 *    ```
 *
 * 2. **Markdown body** (e.g. profiles/fn/USER.md, more common in
 *    practice): a list item or paragraph like `**Name:** Operator`
 *    or plain `Name: Operator`. Spec 0066 A's first pass only
 *    handled #1 and the operator hit the slug-fallback path on the
 *    fn profile that uses #2 — see PR #31 for the cosmetic followup
 *    plus this parser fix.
 *
 * Returns null when USER.md is missing or neither format matches —
 * the dashboard renders the profile slug in that case.
 *
 * Intentionally narrow: still no YAML parser dep. If USER.md gains
 * more structured fields, the worker already reads it raw
 * (apps/worker/src/agent/system-prompt.ts).
 */
function readProfileInfo(profileDir: string): ProfileInfo {
  const slug = process.env.ZENO_PROFILE ?? 'default';
  const userMdPath = join(profileDir, 'USER.md');
  if (!existsSync(userMdPath)) return { name: null, slug };
  const content = readFileSync(userMdPath, 'utf8');
  return { name: parseUserMdName(content), slug };
}

export function parseUserMdName(content: string): string | null {
  // Format #1: YAML frontmatter `---\nname: X\n---`.
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  const frontmatterBody = fm?.[1];
  if (frontmatterBody) {
    const nameMatch = frontmatterBody.match(/^name:\s*(.+?)\s*$/m);
    const fmName = nameMatch?.[1]?.trim();
    if (fmName) return fmName;
  }

  // Format #2: markdown body. Anywhere in the file, line that starts
  // with optional list/markdown decoration and reads `Name: X` or
  // `**Name:** X`. Case-insensitive on the key. Trailing/leading
  // markdown emphasis chars (* _ `) on the captured value are
  // stripped in JS to avoid combinatorial regex pain.
  const bodyMatch = content.match(/^[\s>\-*]*\**\s*name\s*\**\s*:\s*(.+?)\s*$/im);
  const bodyName = bodyMatch?.[1]
    ?.trim()
    ?.replace(/^[*_`\s]+|[*_`\s]+$/g, '')
    ?.trim();
  if (bodyName) return bodyName;

  return null;
}

// Spec 0067 B: hardcoded allowlist of profile files writable via the
// API. Only USER.md flips writable in this spec — SOUL.md is committed
// identity, crons.yaml is legacy (manage via /crons), mcp.json is gone
// (post-spec-0032 it's DB-managed). Anything not in this set returns 403.
const WRITABLE_FILES = new Set(['USER.md']);

// Spec 0067 B: hard cap on PUT body. USER.md is structural metadata,
// not free-form content — 32 kB is generous (current FN is ~1.5 kB).
const MAX_PROFILE_FILE_BYTES = 32_768;

export function buildSettingsRoute(deps: SettingsRouteDeps): Hono {
  const route = new Hono();

  route.get('/', (c) => {
    const backendName = process.env.ZENO_BACKEND ?? 'claude-code';
    return c.json({
      backend: { name: backendName, selectedVia: 'ZENO_BACKEND env' },
      profile: readProfileInfo(deps.profileDir),
      profileFiles: readProfileFiles(deps.profileDir),
    });
  });

  /**
   * Spec 0067 B: read a profile file's full content (paired with PUT).
   *
   * Same allowlist as PUT — only USER.md is exposed today. Returns
   * 404 when the file is missing (the dashboard renders an empty
   * textarea seeded with default frontmatter in that case).
   */
  route.get('/profile-files/:path', (c) => {
    const path = c.req.param('path');
    if (!WRITABLE_FILES.has(path)) {
      return c.json({ error: 'forbidden', detail: `file not readable: ${path}` }, 403);
    }
    const finalPath = join(deps.profileDir, path);
    if (!existsSync(finalPath)) {
      return c.json({ error: 'not_found', detail: `${path} does not exist yet` }, 404);
    }
    const content = readFileSync(finalPath, 'utf8');
    const stat = statSync(finalPath);
    return c.json({ path, bytes: stat.size, mtime: stat.mtime.toISOString(), content });
  });

  /**
   * Spec 0067 B: write a profile file from the dashboard editor.
   *
   * Path is taken verbatim from the URL parameter — no joining with
   * user-supplied bytes. The hardcoded WRITABLE_FILES allowlist
   * rejects anything other than USER.md (returning 403). A path
   * containing '/' or '..' won't reach this handler at all because
   * Hono treats them as separate segments and the route registration
   * uses `:path` (no wildcard).
   *
   * Atomic write: tempfile + rename. The chokidar watcher in the
   * worker fires once on the rename so the system prompt rebuilds
   * for the next agent turn.
   */
  route.put('/profile-files/:path', async (c) => {
    const path = c.req.param('path');
    if (!WRITABLE_FILES.has(path)) {
      return c.json({ error: 'forbidden', detail: `file not writable: ${path}` }, 403);
    }
    let body: { content?: unknown };
    try {
      body = (await c.req.json()) as { content?: unknown };
    } catch {
      return c.json({ error: 'bad_request', detail: 'invalid json body' }, 400);
    }
    const content = body.content;
    if (typeof content !== 'string') {
      return c.json({ error: 'bad_request', detail: '`content` must be a string' }, 400);
    }
    if (Buffer.byteLength(content, 'utf8') > MAX_PROFILE_FILE_BYTES) {
      return c.json(
        { error: 'payload_too_large', detail: `max ${MAX_PROFILE_FILE_BYTES} bytes` },
        413,
      );
    }
    const finalPath = join(deps.profileDir, path);
    const tmpPath = `${finalPath}.tmp`;
    try {
      writeFileSync(tmpPath, content, 'utf8');
      renameSync(tmpPath, finalPath);
    } catch (err) {
      return c.json({ error: 'write_failed', detail: String(err) }, 500);
    }
    const stat = statSync(finalPath);
    return c.json({ path, bytes: stat.size, mtime: stat.mtime.toISOString(), content });
  });

  return route;
}
