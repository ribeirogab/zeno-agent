import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AgentCapabilityRepo,
  CommandRepo,
  ConnectorRepo,
  ConnectorSkillRepo,
  CronRepo,
  CronRunRepo,
  type DB,
  LogRepo,
  openDatabase,
  runMigrations,
  SkillRepo,
} from '@zeno/storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signSession } from '@/auth/hmac';
import { COOKIE_NAME } from '@/auth/middleware';
import { createApp } from '@/server';

const SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function authed(): { Cookie: string; 'Content-Type': string } {
  return {
    Cookie: `${COOKIE_NAME}=${signSession(SECRET, Date.now() + 60_000)}`,
    'Content-Type': 'application/json',
  };
}

let db: DB;
let claudeHomeRoot: string;
let cleanups: Array<() => Promise<void>> = [];

beforeEach(async () => {
  db = openDatabase(':memory:');
  runMigrations(db);
  claudeHomeRoot = await mkdtemp(join(tmpdir(), 'zeno-skills-api-'));
  cleanups.push(async () => {
    await rm(claudeHomeRoot, { recursive: true, force: true });
  });
});

afterEach(async () => {
  for (const c of cleanups) await c();
  cleanups = [];
});

function makeApp(database: DB) {
  return createApp({
    config: {
      password: 'pw',
      sessionSecret: SECRET,
      logLevel: 'info',
      workspaceDir: '/tmp',
      nodeEnv: 'test',
      port: 3000,
    },
    db: database,
    cronRepo: new CronRepo(database),
    cronRunRepo: new CronRunRepo(database),
    commandRepo: new CommandRepo(database),
    logRepo: new LogRepo(database),
    connectorRepo: new ConnectorRepo(database),
    skillRepo: new SkillRepo(database),
    connectorSkillRepo: new ConnectorSkillRepo(database),
    agentCapabilityRepo: new AgentCapabilityRepo(database),
    claudeHome: '/tmp',
    claudeHomeRoot,
    profileDir: '/tmp',
  });
}

const sampleMd = `---
name: frontend-design
description: Padrão de UX e revisão de código React/Tailwind.
---

# Frontend design review

Antes de aprovar PR de frontend...`;

describe('GET /api/skills', () => {
  it('returns empty list when no skills are installed', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/skills', { headers: authed() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns metadata only (no body) for the list endpoint', async () => {
    const repo = new SkillRepo(db);
    repo.create({ name: 'frontend-design', description: 'd', body: 'huge body' });
    const app = makeApp(db);
    const res = await app.request('/api/skills', { headers: authed() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ name: 'frontend-design', description: 'd' });
    expect(body[0]).not.toHaveProperty('body');
  });
});

describe('POST /api/skills', () => {
  it('accepts valid SKILL.md, persists it, materializes the FS file, returns 201', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/skills', {
      method: 'POST',
      body: JSON.stringify({ content: sampleMd }),
      headers: authed(),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      name: 'frontend-design',
      description: 'Padrão de UX e revisão de código React/Tailwind.',
    });
    // FS materialization
    const written = await readFile(
      join(claudeHomeRoot, 'skills', 'frontend-design', 'SKILL.md'),
      'utf8',
    );
    expect(written).toContain('# Frontend design review');
    expect(written).toContain('description: Padrão de UX');
  });

  it('returns 409 on duplicate name', async () => {
    const app = makeApp(db);
    await app.request('/api/skills', {
      method: 'POST',
      body: JSON.stringify({ content: sampleMd }),
      headers: authed(),
    });
    const second = await app.request('/api/skills', {
      method: 'POST',
      body: JSON.stringify({ content: sampleMd }),
      headers: authed(),
    });
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: string; name: string };
    expect(body.error).toBe('skill_already_exists');
    expect(body.name).toBe('frontend-design');
  });

  it('returns 400 with structured errors when frontmatter is invalid', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/skills', {
      method: 'POST',
      body: JSON.stringify({ content: '---\nname: x\n---\n\nno description' }),
      headers: authed(),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; errors: Array<{ field: string }> };
    expect(body.error).toBe('invalid_frontmatter');
    expect(body.errors.some((e) => e.field === 'description')).toBe(true);
  });

  it('ignores allowed-tools field (skills.sh legacy)', async () => {
    const app = makeApp(db);
    const md = `---
name: legacy
description: from skills.sh
allowed-tools: [Read, Edit, Write, Bash]
---

body`;
    const res = await app.request('/api/skills', {
      method: 'POST',
      body: JSON.stringify({ content: md }),
      headers: authed(),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.name).toBe('legacy');
    expect(body).not.toHaveProperty('allowedTools');
  });
});

describe('PATCH /api/skills/:id', () => {
  it('updates body + description; rewrites the FS file', async () => {
    const app = makeApp(db);
    const created = (await (
      await app.request('/api/skills', {
        method: 'POST',
        body: JSON.stringify({ content: sampleMd }),
        headers: authed(),
      })
    ).json()) as { id: string };

    const updated = `---
name: frontend-design
description: New description
---

# New body`;
    const res = await app.request(`/api/skills/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: updated }),
      headers: authed(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    expect(body.description).toBe('New description');
    expect(body.body).toContain('# New body');

    const fsContent = await readFile(
      join(claudeHomeRoot, 'skills', 'frontend-design', 'SKILL.md'),
      'utf8',
    );
    expect(fsContent).toContain('# New body');
    expect(fsContent).toContain('description: New description');
  });

  it('rejects 400 when frontmatter name differs from existing skill name', async () => {
    const app = makeApp(db);
    const created = (await (
      await app.request('/api/skills', {
        method: 'POST',
        body: JSON.stringify({ content: sampleMd }),
        headers: authed(),
      })
    ).json()) as { id: string };

    const renamed = `---
name: renamed-skill
description: x
---

body`;
    const res = await app.request(`/api/skills/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: renamed }),
      headers: authed(),
    });
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toMatchObject({ error: 'name_immutable' });
  });
});

describe('DELETE /api/skills/:id', () => {
  it('removes the row, deletes the FS dir, returns 204', async () => {
    const app = makeApp(db);
    const created = (await (
      await app.request('/api/skills', {
        method: 'POST',
        body: JSON.stringify({ content: sampleMd }),
        headers: authed(),
      })
    ).json()) as { id: string };

    const dirsBefore = await readdir(join(claudeHomeRoot, 'skills'));
    expect(dirsBefore).toContain('frontend-design');

    const res = await app.request(`/api/skills/${created.id}`, {
      method: 'DELETE',
      headers: authed(),
    });
    expect(res.status).toBe(204);

    const get = await app.request(`/api/skills/${created.id}`, { headers: authed() });
    expect(get.status).toBe(404);

    const dirsAfter = await readdir(join(claudeHomeRoot, 'skills')).catch(() => []);
    expect(dirsAfter).not.toContain('frontend-design');
  });

  it('returns 404 for a missing id', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/skills/nonexistent', {
      method: 'DELETE',
      headers: authed(),
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/skills/:id/download', () => {
  it('returns text/markdown with frontmatter + body recomposed', async () => {
    const app = makeApp(db);
    const created = (await (
      await app.request('/api/skills', {
        method: 'POST',
        body: JSON.stringify({ content: sampleMd }),
        headers: authed(),
      })
    ).json()) as { id: string };

    const res = await app.request(`/api/skills/${created.id}/download`, { headers: authed() });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    expect(res.headers.get('content-disposition')).toContain('frontend-design.md');
    const body = await res.text();
    expect(body).toContain('---\nname: frontend-design');
    expect(body).toContain('# Frontend design review');
  });
});

describe('GET /api/skills/download-all', () => {
  it('returns application/zip', async () => {
    const app = makeApp(db);
    await app.request('/api/skills', {
      method: 'POST',
      body: JSON.stringify({ content: sampleMd }),
      headers: authed(),
    });
    const res = await app.request('/api/skills/download-all', { headers: authed() });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/zip');
    expect(res.headers.get('content-disposition')).toContain('zeno-skills.zip');
    const buf = Buffer.from(await res.arrayBuffer());
    // Zip magic bytes.
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });
});
