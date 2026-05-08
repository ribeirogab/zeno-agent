/**
 * Skills REST API. Spec 0052 + 0062.
 *
 * Endpoints (post spec 0062):
 *   - GET    /api/skills                       — list metadata (no body)
 *   - GET    /api/skills/:id                   — full skill metadata + linked counts
 *   - GET    /api/skills/:id/files             — file tree (path/sizeBytes/mimeType)
 *   - GET    /api/skills/:id/files/:path       — stream a single file
 *   - PUT    /api/skills/:id/files/:path       — overwrite a file (dashboard only)
 *   - DELETE /api/skills/:id/files/:path       — remove a file (dashboard only)
 *   - GET    /api/skills/:id/download          — stream zip of canonical dir
 *   - GET    /api/skills/download-all          — zip-of-zips (each skill is sub-dir)
 *   - POST   /api/skills                       — multipart zip install
 *   - PATCH  /api/skills/:id                   — description-only (immutable for
 *                                                zeno_default + profile)
 *   - DELETE /api/skills/:id                   — cleanup canonical FS (dashboard);
 *                                                rows auto-cascade connector_skills
 *                                                + cron_skills via FK
 *
 * Spec 0062: skill bytes live on disk under canonicalPath(skill). The route
 * never reads/writes ${claudeHome}/skills/ — that's the materializer's
 * symlink farm. Operators that drop files via SSH skip the API entirely
 * and the watcher catches it on next boot or fs.watch event.
 *
 * Linked skills (M:N with connectors) live under /api/connectors/:id/skills.
 * Agent capabilities (global non-MCP toggle list) live under
 * /api/agent-capabilities. See `connector-skills.ts` and
 * `agent-capabilities.ts`.
 */

import { createReadStream, type Dirent } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { zValidator } from '@hono/zod-validator';
import type { ConnectorSkillRepo, CronSkillRepo, Skill, SkillRepo } from '@zeno/db/runtime';
import type { Logger } from '@zeno/logger';
import archiver from 'archiver';
import { Hono } from 'hono';
import { z } from 'zod';
import { parseSkillFrontmatter } from '@/lib/parse-skill-frontmatter';
import { extractZipWithCaps } from '@/lib/skill-zip';

export interface SkillsRouteDeps {
  skills: SkillRepo;
  /** Spec 0062: aggregate counts for `GET /:id` (delete cascade modal). */
  connectorSkills: ConnectorSkillRepo;
  cronSkills: CronSkillRepo;
  logger: Logger;
}

const editBody = z.object({
  description: z.string().min(1).max(1000),
});

const FILE_SIZE_CAP = 1_000_000; // 1 MB per-file edit cap, matches install pipeline.

/** Read SKILL.md body section (everything after the closing `---\n` of frontmatter). */
async function readSkillBody(canonicalPath: string): Promise<string> {
  try {
    const raw = await readFile(join(canonicalPath, 'SKILL.md'), 'utf8');
    const match = raw.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
    return match?.[1]?.replace(/^\n/, '') ?? '';
  } catch {
    return '';
  }
}

/** Reject `..` and absolute paths. Returns the relative path on success. */
function safeRelativePath(raw: string): string | null {
  if (raw.length === 0) return null;
  const normalized = raw.replace(/\\/g, '/');
  if (normalized.startsWith('/')) return null;
  if (/^[a-zA-Z]:[\\/]/.test(raw)) return null;
  for (const part of normalized.split('/')) {
    if (part === '..') return null;
  }
  return normalized;
}

interface FileEntry {
  path: string;
  sizeBytes: number;
  mimeType: string;
}

function inferMimeType(path: string): string {
  const ext = path.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'md':
    case 'markdown':
      return 'text/markdown';
    case 'json':
      return 'application/json';
    case 'yaml':
    case 'yml':
      return 'application/yaml';
    case 'sh':
    case 'bash':
      return 'application/x-sh';
    case 'py':
      return 'text/x-python';
    case 'js':
      return 'text/javascript';
    case 'ts':
      return 'text/x-typescript';
    case 'txt':
      return 'text/plain';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

async function walkSkillDir(root: string): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  async function visit(dir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue; // skip dotfiles
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const st = await stat(abs);
      out.push({
        path: relative(root, abs).replace(/\\/g, '/'),
        sizeBytes: st.size,
        mimeType: inferMimeType(entry.name),
      });
    }
  }
  await visit(root);
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

/** Append the contents of `srcDir` into `archive` under `archivePrefix/`. */
async function appendDirToArchive(
  archive: archiver.Archiver,
  srcDir: string,
  archivePrefix: string,
): Promise<void> {
  async function visit(dir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = relative(srcDir, abs).replace(/\\/g, '/');
      archive.file(abs, { name: `${archivePrefix}/${rel}` });
    }
  }
  await visit(srcDir);
}

export function buildSkillsRoute(deps: SkillsRouteDeps): Hono {
  const route = new Hono();

  route.get('/', (c) => {
    // Return metadata only (no body) — the list page doesn't need the content.
    // Spec 0053: include `source` so the dashboard can render the badge +
    // hide edit/delete actions for `zeno_default` rows.
    const all = deps.skills.list().map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      source: s.source,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
    return c.json(all);
  });

  // GET /download-all must be registered BEFORE GET /:id so it doesn't get
  // captured by the param route (Hono matches in registration order).
  route.get('/download-all', async (c) => {
    const all = deps.skills.list();
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on('data', (chunk) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);
    });
    for (const skill of all) {
      const canonical = deps.skills.canonicalPath(skill);
      try {
        await stat(canonical);
        await appendDirToArchive(archive, canonical, skill.name);
      } catch {
        // canonical dir missing — skip the skill rather than failing the
        // whole archive (operator may have lost a profile mount mid-restore).
        deps.logger.warn(
          { event: 'skills_download_all_skip_missing', name: skill.name },
          `download-all: canonical dir missing for ${skill.name}, skipping`,
        );
      }
    }
    await archive.finalize();
    const zip = await done;
    c.header('Content-Type', 'application/zip');
    c.header('Content-Disposition', 'attachment; filename="zeno-skills.zip"');
    return c.body(new Uint8Array(zip));
  });

  route.get('/:id', (c) => {
    const id = c.req.param('id');
    const skill = deps.skills.get(id);
    if (!skill) return c.json({ error: 'not_found' }, 404);
    // Spec 0062: aggregate counts for the delete cascade modal.
    const connectorSkillsCount = deps.connectorSkills.listForSkill(id).length;
    const cronSkillsCount = deps.cronSkills.listForSkill(id).length;
    return c.json({ ...skill, connectorSkillsCount, cronSkillsCount });
  });

  // ===== GET /:id/download (zip stream of canonical dir) =====
  route.get('/:id/download', async (c) => {
    const id = c.req.param('id');
    const skill = deps.skills.get(id);
    if (!skill) return c.json({ error: 'not_found' }, 404);
    const canonical = deps.skills.canonicalPath(skill);
    try {
      await stat(canonical);
    } catch {
      return c.json({ error: 'not_found', message: 'canonical FS dir missing' }, 404);
    }
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on('data', (chunk) => chunks.push(chunk));
    const done = new Promise<Buffer>((res, rej) => {
      archive.on('end', () => res(Buffer.concat(chunks)));
      archive.on('error', rej);
    });
    await appendDirToArchive(archive, canonical, skill.name);
    await archive.finalize();
    const zip = await done;
    c.header('Content-Type', 'application/zip');
    c.header('Content-Disposition', `attachment; filename="${skill.name}.zip"`);
    return c.body(new Uint8Array(zip));
  });

  // ===== GET /:id/files (file tree) =====
  route.get('/:id/files', async (c) => {
    const id = c.req.param('id');
    const skill = deps.skills.get(id);
    if (!skill) return c.json({ error: 'not_found' }, 404);
    const canonical = deps.skills.canonicalPath(skill);
    const entries = await walkSkillDir(canonical);
    return c.json(entries);
  });

  // ===== GET /:id/files/:path (read single file) =====
  route.get('/:id/files/:path{.+}', async (c) => {
    const id = c.req.param('id');
    const rawPath = decodeURIComponent(c.req.param('path') ?? '');
    const skill = deps.skills.get(id);
    if (!skill) return c.json({ error: 'not_found' }, 404);
    const safePath = safeRelativePath(rawPath);
    if (!safePath) {
      return c.json({ error: 'skill_path_invalid', message: `unsafe path: ${rawPath}` }, 400);
    }
    const canonical = deps.skills.canonicalPath(skill);
    const filePath = join(canonical, safePath);
    // Defense in depth: ensure resolved path stays within canonical.
    if (!resolve(filePath).startsWith(resolve(canonical))) {
      return c.json({ error: 'skill_path_invalid', message: 'path escapes canonical' }, 400);
    }
    try {
      const st = await stat(filePath);
      if (!st.isFile()) return c.json({ error: 'not_found' }, 404);
    } catch {
      return c.json({ error: 'not_found' }, 404);
    }
    c.header('Content-Type', inferMimeType(safePath));
    const stream = createReadStream(filePath);
    return c.body(Readable.toWeb(stream) as ReadableStream);
  });

  // ===== PUT /:id/files/:path (write single file) =====
  route.put('/:id/files/:path{.+}', async (c) => {
    const id = c.req.param('id');
    const rawPath = decodeURIComponent(c.req.param('path') ?? '');
    const skill = deps.skills.get(id);
    if (!skill) return c.json({ error: 'not_found' }, 404);
    if (skill.source !== 'dashboard') {
      return c.json(
        {
          error: 'skill_source_immutable',
          message: `Skill '${skill.name}' has source '${skill.source}' and cannot be edited from the dashboard. Edit on the host.`,
        },
        403,
      );
    }
    const safePath = safeRelativePath(rawPath);
    if (!safePath) {
      return c.json({ error: 'skill_path_invalid', message: `unsafe path: ${rawPath}` }, 400);
    }
    const body = await c.req.text();
    if (Buffer.byteLength(body, 'utf8') > FILE_SIZE_CAP) {
      return c.json(
        {
          error: 'skill_file_too_large',
          message: `Body exceeds ${FILE_SIZE_CAP} bytes`,
        },
        413,
      );
    }
    const canonical = deps.skills.canonicalPath(skill);
    const filePath = join(canonical, safePath);
    if (!resolve(filePath).startsWith(resolve(canonical))) {
      return c.json({ error: 'skill_path_invalid', message: 'path escapes canonical' }, 400);
    }
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, body, 'utf8');

    // If SKILL.md changed, re-parse frontmatter and sync description in DB.
    if (safePath === 'SKILL.md') {
      const parsed = parseSkillFrontmatter(body);
      if (parsed.ok && parsed.frontmatter.description !== skill.description) {
        deps.skills.update(id, { description: parsed.frontmatter.description });
      }
    }

    deps.logger.info(
      { event: 'skill_file_written', skillId: id, path: safePath, bytes: body.length },
      `wrote ${safePath} for skill ${skill.name}`,
    );
    return c.body(null, 204);
  });

  // ===== DELETE /:id/files/:path (remove single file) =====
  route.delete('/:id/files/:path{.+}', async (c) => {
    const id = c.req.param('id');
    const rawPath = decodeURIComponent(c.req.param('path') ?? '');
    const skill = deps.skills.get(id);
    if (!skill) return c.json({ error: 'not_found' }, 404);
    if (skill.source !== 'dashboard') {
      return c.json(
        {
          error: 'skill_source_immutable',
          message: `Skill '${skill.name}' has source '${skill.source}' and cannot be edited from the dashboard.`,
        },
        403,
      );
    }
    const safePath = safeRelativePath(rawPath);
    if (!safePath) {
      return c.json({ error: 'skill_path_invalid', message: `unsafe path: ${rawPath}` }, 400);
    }
    if (safePath === 'SKILL.md') {
      return c.json({ error: 'skill_md_required', message: 'SKILL.md cannot be deleted' }, 422);
    }
    const canonical = deps.skills.canonicalPath(skill);
    const filePath = join(canonical, safePath);
    if (!resolve(filePath).startsWith(resolve(canonical))) {
      return c.json({ error: 'skill_path_invalid', message: 'path escapes canonical' }, 400);
    }
    try {
      await unlink(filePath);
    } catch {
      return c.json({ error: 'not_found' }, 404);
    }
    deps.logger.info(
      { event: 'skill_file_deleted', skillId: id, path: safePath },
      `deleted ${safePath} for skill ${skill.name}`,
    );
    return c.body(null, 204);
  });

  // ===== POST / (multipart zip install) =====
  route.post('/', async (c) => {
    const form = await c.req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return c.json({ error: 'missing_file', message: "expected multipart field 'file'" }, 400);
    }
    // Determine the dashboard root from any existing skill (cheap) or fall
    // back to scanning the ctor — easier: ask SkillRepo via a synthetic skill.
    // Use the canonicalPath of a dummy 'dashboard' source skill — we never
    // persist it; just resolve the root.
    const dashboardRoot = deps.skills.canonicalPath({
      id: '_',
      name: '_root_',
      description: '_',
      source: 'dashboard',
      createdAt: '',
      updatedAt: '',
    } as Skill);
    const dashboardSkillsRoot = dirname(dashboardRoot);
    await mkdir(dashboardSkillsRoot, { recursive: true });

    const buf = Buffer.from(await (file as File).arrayBuffer());
    const zipStream = Readable.from(buf);
    const result = await extractZipWithCaps(zipStream, dashboardSkillsRoot);
    if (!result.ok) {
      const status =
        result.code === 'skill_path_invalid' ||
        result.code === 'skill_zip_invalid' ||
        result.code === 'skill_too_many_files'
          ? 400
          : 413;
      return c.json({ error: result.code, message: result.message }, status);
    }

    // Validate SKILL.md at root.
    const skillMdPath = join(result.extractedPath, 'SKILL.md');
    let skillMd: string;
    try {
      skillMd = await readFile(skillMdPath, 'utf8');
    } catch {
      await rm(result.extractedPath, { recursive: true, force: true });
      return c.json(
        {
          error: 'skill_frontmatter_missing',
          message: 'No SKILL.md found at root of zip',
        },
        400,
      );
    }
    const parsed = parseSkillFrontmatter(skillMd);
    if (!parsed.ok) {
      await rm(result.extractedPath, { recursive: true, force: true });
      return c.json(
        {
          error: 'skill_frontmatter_missing',
          message: 'SKILL.md frontmatter parse failed',
          errors: parsed.errors,
        },
        400,
      );
    }

    // UNIQUE name check.
    const existing = deps.skills.getByName(parsed.frontmatter.name);
    if (existing) {
      await rm(result.extractedPath, { recursive: true, force: true });
      return c.json(
        {
          error: 'skill_name_taken',
          message: `A skill named '${parsed.frontmatter.name}' is already installed (source: ${existing.source})`,
          name: parsed.frontmatter.name,
        },
        409,
      );
    }

    // Atomic rename → final canonical path.
    const finalPath = join(dashboardSkillsRoot, parsed.frontmatter.name);
    try {
      await rename(result.extractedPath, finalPath);
    } catch (err) {
      await rm(result.extractedPath, { recursive: true, force: true });
      return c.json(
        {
          error: 'skill_zip_invalid',
          message: `Failed to install: ${(err as Error).message}`,
        },
        500,
      );
    }

    // Insert DB row.
    const created = deps.skills.create({
      name: parsed.frontmatter.name,
      description: parsed.frontmatter.description,
      source: 'dashboard',
    });

    deps.logger.info(
      {
        event: 'skill_installed',
        skillId: created.id,
        name: created.name,
        files: result.fileCount,
        bytes: result.totalBytes,
      },
      `installed skill ${created.name} (${result.fileCount} files, ${result.totalBytes} bytes)`,
    );
    return c.json(created, 201);
  });

  // ===== PATCH /:id (description-only) =====
  route.patch('/:id', zValidator('json', editBody), async (c) => {
    const id = c.req.param('id');
    const existing = deps.skills.get(id);
    if (!existing) return c.json({ error: 'not_found' }, 404);

    // Spec 0053 + 0062: zeno_default and profile sources are read-only via
    // dashboard. The canonical content lives in image / profile mounts.
    if (existing.source === 'zeno_default' || existing.source === 'profile') {
      return c.json(
        {
          error: 'skill_source_immutable',
          message: `Skill '${existing.name}' has source '${existing.source}' and cannot be edited from the dashboard.`,
        },
        403,
      );
    }

    const updated = deps.skills.update(id, { description: c.req.valid('json').description });
    if (!updated) return c.json({ error: 'not_found' }, 404);

    // Rewrite SKILL.md frontmatter so dashboard description and FS stay in sync.
    const canonical = deps.skills.canonicalPath(updated);
    const skillMdPath = join(canonical, 'SKILL.md');
    try {
      const body = await readSkillBody(canonical);
      await writeFile(
        skillMdPath,
        `---\nname: ${updated.name}\ndescription: ${updated.description}\n---\n\n${body}`,
        'utf8',
      );
    } catch (err) {
      deps.logger.warn(
        { event: 'skill_description_fs_sync_failed', name: updated.name, err: String(err) },
        `description sync failed for ${updated.name} — DB updated but SKILL.md frontmatter is stale`,
      );
    }

    deps.logger.info(
      { event: 'skill_description_updated', skillId: updated.id, name: updated.name },
      `updated description for ${updated.name}`,
    );
    return c.json(updated);
  });

  // ===== DELETE /:id =====
  route.delete('/:id', async (c) => {
    const id = c.req.param('id');
    const existing = deps.skills.get(id);
    if (!existing) return c.json({ error: 'not_found' }, 404);

    // Spec 0053 + 0062: zeno_default + profile are read-only from dashboard.
    // (Profile gets a delete affordance with reseed warning in the UI; the
    // spec calls for the Delete to remove the DB row and let the watcher
    // re-INSERT-OR-IGNORE on next boot. So profile DELETE proceeds at the
    // API but does NOT remove the FS dir.)
    if (existing.source === 'zeno_default') {
      return c.json(
        {
          error: 'skill_source_immutable',
          message: `Skill '${existing.name}' is shipped with the worker image and cannot be deleted from the dashboard.`,
        },
        403,
      );
    }

    const canonicalPath = deps.skills.canonicalPath(existing);
    deps.skills.delete(id);

    if (existing.source === 'dashboard') {
      // Remove the canonical FS dir (writable volume).
      try {
        await rm(canonicalPath, { recursive: true, force: true });
      } catch (err) {
        deps.logger.warn(
          { event: 'skill_delete_fs_cleanup_failed', name: existing.name, err: String(err) },
          `FS cleanup failed for ${existing.name} — DB row deleted but ${canonicalPath} may remain`,
        );
      }
    }
    // For profile: leave the canonical FS alone (read-only mount). The
    // reseed warning in the UI explains this to the operator.

    deps.logger.info(
      { event: 'skill_deleted', skillId: id, name: existing.name, source: existing.source },
      `deleted skill ${existing.name} (${existing.source})`,
    );
    return c.body(null, 204);
  });

  return route;
}
