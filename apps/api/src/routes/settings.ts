import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { parseUserMdName } from '../lib/parse-user-md';

export { parseUserMdName };

const TRACKED_FILES = ['SOUL.md', 'USER.md', 'crons.yaml'] as const;

// Spec 0067 C: CommandRepo dep removed alongside the Restart Worker
// route. Re-add when a settings action needs to enqueue commands again.
// Spec 0072: backendSettings injected so the GET / response sources the
// active backend slug from the runtime DB instead of process.env.ZENO_BACKEND.
export interface SettingsRouteDeps {
  profileDir: string;
  backendSettings: { get: (key: string) => string | null };
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
 * Read profile metadata from USER.md. Returns the parsed operator
 * name (or null if USER.md is missing/unparseable) and the profile
 * slug from the ZENO_PROFILE env.
 */
function readProfileInfo(profileDir: string): ProfileInfo {
  const slug = process.env.ZENO_PROFILE ?? 'default';
  const userMdPath = join(profileDir, 'USER.md');
  if (!existsSync(userMdPath)) return { name: null, slug };
  const content = readFileSync(userMdPath, 'utf8');
  return { name: parseUserMdName(content), slug };
}

// Spec 0067 B: hardcoded allowlist of profile files writable via the
// API. Only USER.md flips writable in this spec — SOUL.md is committed
// identity, crons.yaml is legacy (manage via /crons), mcp.json is gone
// (post-spec-0032 it's DB-managed). Anything not in this set returns 403.
const WRITABLE_FILES = new Set(['USER.md']);

// Spec 0067 B: hard cap on PUT body. USER.md is structural metadata,
// not free-form content — 32 kB is generous (typical USER.md is 1–2 kB).
const MAX_PROFILE_FILE_BYTES = 32_768;

export function buildSettingsRoute(deps: SettingsRouteDeps): Hono {
  const route = new Hono();

  route.get('/', (c) => {
    const backendName = deps.backendSettings.get('active_backend_id') ?? 'claude-code';
    return c.json({
      backend: { name: backendName, selectedVia: 'runtime_db' },
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
