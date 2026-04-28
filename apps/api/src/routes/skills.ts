/**
 * Skills REST API. Spec 0052 Phase C.1.
 *
 * Endpoints:
 *   - GET    /api/skills                     — list (metadata only, no body)
 *   - GET    /api/skills/:id                 — full skill
 *   - POST   /api/skills                     — upload SKILL.md content; parses
 *                                              frontmatter, validates, inserts.
 *                                              Returns 201 + Skill, 409 on name
 *                                              conflict, 400 with structured
 *                                              `errors` on parse/validation fail.
 *   - PATCH  /api/skills/:id                 — body update only (name immutable)
 *   - DELETE /api/skills/:id                 — 204; FK CASCADE drops link rows
 *   - GET    /api/skills/:id/download        — text/markdown of the skill
 *   - GET    /api/skills/download-all        — application/zip of all skills
 *
 * After every mutation, the route triggers a synchronous filesystem
 * materialization so the Claude Agent SDK auto-discovers the change on the
 * next agent query. API and worker share the same filesystem in-container.
 *
 * Linked skills (M:N with connectors) live under /api/connectors/:id/skills.
 * Agent capabilities (global non-MCP toggle list) live under
 * /api/agent-capabilities. See `connector-skills.ts` and
 * `agent-capabilities.ts`.
 */

import type { Dirent } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { zValidator } from '@hono/zod-validator';
import type { Logger } from '@zeno/logger';
import type { Skill, SkillRepo } from '@zeno/storage';
import archiver from 'archiver';
import { Hono } from 'hono';
import { z } from 'zod';
import { parseSkillFrontmatter } from '@/lib/parse-skill-frontmatter';

export interface SkillsRouteDeps {
  skills: SkillRepo;
  /** Absolute path to ${claudeHome} (`~/.claude`). The route writes `${claudeHome}/skills/<name>/SKILL.md` after each mutation. */
  claudeHome: string;
  logger: Logger;
}

const uploadBody = z.object({
  /** Raw .md content as uploaded. Frontmatter is parsed server-side. */
  content: z.string().min(1),
});

const editBody = z.object({
  /** Replacement raw .md content. Frontmatter must keep the same `name`. */
  content: z.string().min(1),
});

function recompose(skill: Skill): string {
  return `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${skill.body}`;
}

async function writeSkillToFs(claudeHome: string, skill: Skill): Promise<void> {
  const dir = join(claudeHome, 'skills', skill.name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'SKILL.md'), recompose(skill), 'utf8');
}

async function deleteSkillFromFs(claudeHome: string, name: string): Promise<void> {
  await rm(join(claudeHome, 'skills', name), { recursive: true, force: true });
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
      archive.append(recompose(skill), { name: `${skill.name}/SKILL.md` });
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
    return c.json(skill);
  });

  route.get('/:id/download', (c) => {
    const id = c.req.param('id');
    const skill = deps.skills.get(id);
    if (!skill) return c.json({ error: 'not_found' }, 404);
    c.header('Content-Type', 'text/markdown; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="${skill.name}.md"`);
    return c.body(recompose(skill));
  });

  route.post('/', zValidator('json', uploadBody), async (c) => {
    const { content } = c.req.valid('json');
    const parsed = parseSkillFrontmatter(content);
    if (!parsed.ok) {
      return c.json({ error: 'invalid_frontmatter', errors: parsed.errors }, 400);
    }

    const existing = deps.skills.getByName(parsed.frontmatter.name);
    if (existing) {
      return c.json(
        {
          error: 'skill_already_exists',
          name: parsed.frontmatter.name,
          message: `Skill '${parsed.frontmatter.name}' já existe. Abre o detail page e clica Edit pra atualizar.`,
        },
        409,
      );
    }

    const created = deps.skills.create({
      name: parsed.frontmatter.name,
      description: parsed.frontmatter.description,
      body: parsed.body,
    });

    await writeSkillToFs(deps.claudeHome, created);
    deps.logger.info(
      { event: 'skill_installed', skillId: created.id, name: created.name },
      `installed skill ${created.name}`,
    );
    return c.json(created, 201);
  });

  route.patch('/:id', zValidator('json', editBody), async (c) => {
    const id = c.req.param('id');
    const existing = deps.skills.get(id);
    if (!existing) return c.json({ error: 'not_found' }, 404);

    // Spec 0053: zeno_default skills are managed by the binary, not the
    // dashboard. The file in `agent/skills/` is canonical; editing via API
    // would be silently overwritten on the next worker boot.
    if (existing.source === 'zeno_default') {
      return c.json(
        {
          error: 'zeno_default_immutable',
          message: `Skill '${existing.name}' is shipped with Zeno and cannot be edited. To customize, copy it to your profile (drop the 'zeno-' prefix).`,
        },
        403,
      );
    }

    const parsed = parseSkillFrontmatter(c.req.valid('json').content);
    if (!parsed.ok) {
      return c.json({ error: 'invalid_frontmatter', errors: parsed.errors }, 400);
    }
    if (parsed.frontmatter.name !== existing.name) {
      return c.json(
        {
          error: 'name_immutable',
          message: `Skill name is immutable. Got '${parsed.frontmatter.name}' but the skill is named '${existing.name}'. Delete + reinstall to rename.`,
        },
        400,
      );
    }

    const updated = deps.skills.update(id, {
      description: parsed.frontmatter.description,
      body: parsed.body,
    });
    if (!updated) return c.json({ error: 'not_found' }, 404);

    await writeSkillToFs(deps.claudeHome, updated);
    deps.logger.info(
      { event: 'skill_updated', skillId: updated.id, name: updated.name },
      `updated skill ${updated.name}`,
    );
    return c.json(updated);
  });

  route.delete('/:id', async (c) => {
    const id = c.req.param('id');
    const existing = deps.skills.get(id);
    if (!existing) return c.json({ error: 'not_found' }, 404);

    // Spec 0053: zeno_default skills cannot be deleted. The file in
    // `agent/skills/` is canonical; the boot seeder would resurrect the
    // row on the next start anyway.
    if (existing.source === 'zeno_default') {
      return c.json(
        {
          error: 'zeno_default_immutable',
          message: `Skill '${existing.name}' is shipped with Zeno and cannot be deleted. To stop using it, remove the file from agent/skills/ and redeploy.`,
        },
        403,
      );
    }

    deps.skills.delete(id);
    await deleteSkillFromFs(deps.claudeHome, existing.name);
    deps.logger.info(
      { event: 'skill_deleted', skillId: id, name: existing.name },
      `deleted skill ${existing.name}`,
    );
    return c.body(null, 204);
  });

  return route;
}

/** Reads orphan FS dirs that are not in the DB. Useful for diagnostics; not exposed. */
export async function listOrphanSkillDirs(
  claudeHome: string,
  deps: { skills: SkillRepo },
): Promise<string[]> {
  const skillsRoot = join(claudeHome, 'skills');
  const expected = new Set(deps.skills.list().map((s) => s.name));
  let entries: Dirent[] = [];
  try {
    entries = await readdir(skillsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isDirectory() && !expected.has(e.name)).map((e) => e.name);
}
