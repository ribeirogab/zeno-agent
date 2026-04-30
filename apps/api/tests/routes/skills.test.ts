/**
 * Spec 0062 — skills route tests. The shape changed from spec 0052:
 * - POST is now multipart zip (not JSON .md content)
 * - body is gone from all responses
 * - per-file CRUD endpoints replaced PATCH-of-content
 * - download is a zip (not text/markdown)
 * - PATCH is description-only and rejects profile + zeno_default sources
 *
 * Each test sets up a temp dashboard root + writes synthetic SKILL.md +
 * supporting files into the canonicalPath of the skills it creates so the
 * route's FS reads succeed.
 */

import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AgentCapabilityRepo,
  CommandRepo,
  ConnectorRepo,
  ConnectorSkillRepo,
  CronRepo,
  CronRunRepo,
  CronSkillRepo,
  type DB,
  LogRepo,
  openDatabase,
  runMigrations,
  type Skill,
  SkillRepo,
} from '@zeno/storage';
import unzipper from 'unzipper';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signSession } from '@/auth/hmac';
import { COOKIE_NAME } from '@/auth/middleware';
import { createApp } from '@/server';

const SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function authed(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Cookie: `${COOKIE_NAME}=${signSession(SECRET, Date.now() + 60_000)}`,
    ...extra,
  };
}

let db: DB;
let sandbox: string;
let agentSkillsRoot: string;
let profileSkillsRoot: string;
let dashboardSkillsRoot: string;
let skillRepo: SkillRepo;
let cleanups: Array<() => Promise<void>> = [];

beforeEach(async () => {
  db = openDatabase(':memory:');
  runMigrations(db);
  sandbox = await mkdtemp(join(tmpdir(), 'zeno-skills-api-'));
  agentSkillsRoot = join(sandbox, 'agent-skills');
  profileSkillsRoot = join(sandbox, 'profile-skills');
  dashboardSkillsRoot = join(sandbox, 'workspace-skills');
  await mkdir(agentSkillsRoot, { recursive: true });
  await mkdir(profileSkillsRoot, { recursive: true });
  await mkdir(dashboardSkillsRoot, { recursive: true });
  skillRepo = new SkillRepo(db, { agentSkillsRoot, profileSkillsRoot, dashboardSkillsRoot });
  cleanups.push(async () => {
    await rm(sandbox, { recursive: true, force: true });
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
      workspaceDir: sandbox,
      nodeEnv: 'test',
      port: 3000,
    },
    db: database,
    cronRepo: new CronRepo(database),
    cronRunRepo: new CronRunRepo(database),
    commandRepo: new CommandRepo(database),
    logRepo: new LogRepo(database),
    connectorRepo: new ConnectorRepo(database),
    skillRepo,
    connectorSkillRepo: new ConnectorSkillRepo(database),
    cronSkillRepo: new CronSkillRepo(database),
    agentCapabilityRepo: new AgentCapabilityRepo(database),
    claudeHome: '/tmp',
    profileDir: '/tmp',
  });
}

/** Seed a skill: DB row + canonical FS dir with SKILL.md + optional extras. */
async function seedSkill(input: {
  name: string;
  description: string;
  source?: 'dashboard' | 'profile' | 'zeno_default';
  body?: string;
  extras?: Record<string, string>; // path → content
}): Promise<Skill> {
  const source = input.source ?? 'dashboard';
  const skill =
    source === 'dashboard'
      ? skillRepo.create({ name: input.name, description: input.description })
      : skillRepo.upsertBySource({
          name: input.name,
          description: input.description,
          source,
        });
  const dir = skillRepo.canonicalPath(skill);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'SKILL.md'),
    `---\nname: ${input.name}\ndescription: ${input.description}\n---\n\n${input.body ?? '# body'}`,
    'utf8',
  );
  if (input.extras) {
    for (const [path, content] of Object.entries(input.extras)) {
      const abs = join(dir, path);
      await mkdir(join(abs, '..'), { recursive: true });
      await writeFile(abs, content, 'utf8');
    }
  }
  return skill;
}

/** Build an in-memory zip with the given path → content map. */
async function buildZip(files: Record<string, string>): Promise<Buffer> {
  const archiver = (await import('archiver')).default;
  const archive = archiver('zip', { zlib: { level: 0 } });
  const chunks: Buffer[] = [];
  archive.on('data', (c) => chunks.push(c));
  const done = new Promise<Buffer>((res, rej) => {
    archive.on('end', () => res(Buffer.concat(chunks)));
    archive.on('error', rej);
  });
  for (const [path, content] of Object.entries(files)) {
    archive.append(content, { name: path });
  }
  await archive.finalize();
  return done;
}

describe('GET /api/skills', () => {
  it('returns empty list when no skills installed', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/skills', { headers: authed() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns metadata only (no body field)', async () => {
    await seedSkill({ name: 'a', description: 'A' });
    const app = makeApp(db);
    const res = await app.request('/api/skills', { headers: authed() });
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<Record<string, unknown>>;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'a', description: 'A', source: 'dashboard' });
    expect(list[0]).not.toHaveProperty('body');
  });
});

describe('GET /api/skills/:id', () => {
  it('returns full skill metadata + aggregate counts (connectorSkillsCount, cronSkillsCount)', async () => {
    const skill = await seedSkill({ name: 'a', description: 'A' });
    const app = makeApp(db);
    const res = await app.request(`/api/skills/${skill.id}`, { headers: authed() });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toMatchObject({
      id: skill.id,
      name: 'a',
      description: 'A',
      source: 'dashboard',
      connectorSkillsCount: 0,
      cronSkillsCount: 0,
    });
    expect(json).not.toHaveProperty('body');
  });

  it('returns 404 for missing id', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/skills/nope', { headers: authed() });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/skills/:id/files', () => {
  it('returns the file tree of canonical dir', async () => {
    const skill = await seedSkill({
      name: 'multi',
      description: 'd',
      body: '# body',
      extras: {
        'references/api.md': '# api',
        'scripts/helper.sh': '#!/bin/bash\necho hi',
      },
    });
    const app = makeApp(db);
    const res = await app.request(`/api/skills/${skill.id}/files`, { headers: authed() });
    expect(res.status).toBe(200);
    const tree = (await res.json()) as Array<{ path: string; sizeBytes: number; mimeType: string }>;
    const paths = tree.map((e) => e.path).sort();
    expect(paths).toEqual(['SKILL.md', 'references/api.md', 'scripts/helper.sh']);
    const skillMd = tree.find((e) => e.path === 'SKILL.md');
    expect(skillMd?.mimeType).toBe('text/markdown');
    expect(skillMd?.sizeBytes).toBeGreaterThan(0);
  });

  it('404 for missing skill', async () => {
    const app = makeApp(db);
    const res = await app.request('/api/skills/nope/files', { headers: authed() });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/skills/:id/files/:path', () => {
  it('streams a single file', async () => {
    const skill = await seedSkill({
      name: 'multi',
      description: 'd',
      extras: { 'references/api.md': '## API' },
    });
    const app = makeApp(db);
    const res = await app.request(
      `/api/skills/${skill.id}/files/${encodeURIComponent('references/api.md')}`,
      {
        headers: authed(),
      },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    const text = await res.text();
    expect(text).toBe('## API');
  });

  it('rejects path traversal with 400 skill_path_invalid', async () => {
    const skill = await seedSkill({ name: 'multi', description: 'd' });
    const app = makeApp(db);
    const res = await app.request(
      `/api/skills/${skill.id}/files/${encodeURIComponent('../escape')}`,
      { headers: authed() },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe('skill_path_invalid');
  });

  it('404 for missing file', async () => {
    const skill = await seedSkill({ name: 'multi', description: 'd' });
    const app = makeApp(db);
    const res = await app.request(`/api/skills/${skill.id}/files/nope.md`, { headers: authed() });
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/skills/:id/files/:path', () => {
  it('writes a file (dashboard source)', async () => {
    const skill = await seedSkill({
      name: 'multi',
      description: 'd',
      extras: { 'references/api.md': 'old' },
    });
    const app = makeApp(db);
    const res = await app.request(
      `/api/skills/${skill.id}/files/${encodeURIComponent('references/api.md')}`,
      {
        method: 'PUT',
        headers: authed({ 'Content-Type': 'text/plain' }),
        body: 'new content',
      },
    );
    expect(res.status).toBe(204);
    const onDisk = await readFile(
      join(skillRepo.canonicalPath(skill), 'references/api.md'),
      'utf8',
    );
    expect(onDisk).toBe('new content');
  });

  it('PUT SKILL.md re-syncs description in DB if frontmatter changed', async () => {
    const skill = await seedSkill({ name: 'multi', description: 'old desc' });
    const app = makeApp(db);
    const newSkillMd = `---\nname: multi\ndescription: new desc\n---\n\nnew body`;
    const res = await app.request(`/api/skills/${skill.id}/files/SKILL.md`, {
      method: 'PUT',
      headers: authed({ 'Content-Type': 'text/plain' }),
      body: newSkillMd,
    });
    expect(res.status).toBe(204);
    const fetched = skillRepo.get(skill.id);
    expect(fetched?.description).toBe('new desc');
  });

  it('returns 403 skill_source_immutable for source=zeno_default', async () => {
    const skill = await seedSkill({ name: 'z', description: 'd', source: 'zeno_default' });
    const app = makeApp(db);
    const res = await app.request(`/api/skills/${skill.id}/files/SKILL.md`, {
      method: 'PUT',
      headers: authed({ 'Content-Type': 'text/plain' }),
      body: 'new',
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as Record<string, unknown>).error).toBe('skill_source_immutable');
  });

  it('returns 403 skill_source_immutable for source=profile', async () => {
    const skill = await seedSkill({ name: 'p', description: 'd', source: 'profile' });
    const app = makeApp(db);
    const res = await app.request(`/api/skills/${skill.id}/files/SKILL.md`, {
      method: 'PUT',
      headers: authed({ 'Content-Type': 'text/plain' }),
      body: 'new',
    });
    expect(res.status).toBe(403);
  });

  it('returns 413 skill_file_too_large for body over 1MB', async () => {
    const skill = await seedSkill({ name: 'multi', description: 'd' });
    const app = makeApp(db);
    const big = 'x'.repeat(1_100_000);
    const res = await app.request(`/api/skills/${skill.id}/files/big.txt`, {
      method: 'PUT',
      headers: authed({ 'Content-Type': 'text/plain' }),
      body: big,
    });
    expect(res.status).toBe(413);
    expect(((await res.json()) as Record<string, unknown>).error).toBe('skill_file_too_large');
  });
});

describe('DELETE /api/skills/:id/files/:path', () => {
  it('deletes a file (dashboard source)', async () => {
    const skill = await seedSkill({
      name: 'multi',
      description: 'd',
      extras: { 'references/api.md': 'x' },
    });
    const app = makeApp(db);
    const res = await app.request(
      `/api/skills/${skill.id}/files/${encodeURIComponent('references/api.md')}`,
      { method: 'DELETE', headers: authed() },
    );
    expect(res.status).toBe(204);
    await expect(stat(join(skillRepo.canonicalPath(skill), 'references/api.md'))).rejects.toThrow();
  });

  it('returns 422 skill_md_required when trying to delete SKILL.md', async () => {
    const skill = await seedSkill({ name: 'multi', description: 'd' });
    const app = makeApp(db);
    const res = await app.request(`/api/skills/${skill.id}/files/SKILL.md`, {
      method: 'DELETE',
      headers: authed(),
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as Record<string, unknown>).error).toBe('skill_md_required');
  });

  it('returns 403 skill_source_immutable for non-dashboard sources', async () => {
    const skill = await seedSkill({
      name: 'z',
      description: 'd',
      source: 'zeno_default',
      extras: { 'references/api.md': 'x' },
    });
    const app = makeApp(db);
    const res = await app.request(
      `/api/skills/${skill.id}/files/${encodeURIComponent('references/api.md')}`,
      { method: 'DELETE', headers: authed() },
    );
    expect(res.status).toBe(403);
  });
});

describe('GET /api/skills/:id/download', () => {
  it('streams a zip of the canonical dir', async () => {
    const skill = await seedSkill({
      name: 'multi',
      description: 'd',
      body: '# body',
      extras: { 'references/api.md': '## API' },
    });
    const app = makeApp(db);
    const res = await app.request(`/api/skills/${skill.id}/download`, { headers: authed() });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/zip');
    expect(res.headers.get('content-disposition')).toContain('multi.zip');
    const buf = Buffer.from(await res.arrayBuffer());
    const dir = await unzipper.Open.buffer(buf);
    const paths = dir.files.map((f) => f.path).sort();
    expect(paths).toEqual(['multi/SKILL.md', 'multi/references/api.md']);
  });
});

describe('GET /api/skills/download-all', () => {
  it('streams a zip-of-zips with each skill as a sub-directory', async () => {
    await seedSkill({ name: 'a', description: 'A' });
    await seedSkill({
      name: 'b',
      description: 'B',
      extras: { 'extra.md': 'x' },
    });
    const app = makeApp(db);
    const res = await app.request('/api/skills/download-all', { headers: authed() });
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    const dir = await unzipper.Open.buffer(buf);
    const paths = dir.files.map((f) => f.path).sort();
    expect(paths).toEqual(['a/SKILL.md', 'b/SKILL.md', 'b/extra.md']);
  });
});

describe('POST /api/skills (zip install)', () => {
  it('installs a valid zip; 201 + row + FS dir', async () => {
    const zip = await buildZip({
      'SKILL.md': '---\nname: brand-new\ndescription: A new one\n---\n\n# body',
      'references/api.md': '## API',
    });
    const app = makeApp(db);
    const fd = new FormData();
    fd.append(
      'file',
      new Blob([new Uint8Array(zip)], { type: 'application/zip' }),
      'brand-new.zip',
    );
    const res = await app.request('/api/skills', {
      method: 'POST',
      headers: authed(),
      body: fd,
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as Record<string, unknown>;
    expect(created.name).toBe('brand-new');
    const onDisk = await readdir(join(dashboardSkillsRoot, 'brand-new'));
    expect([...onDisk].sort()).toEqual(['SKILL.md', 'references']);
    expect(skillRepo.getByName('brand-new')?.source).toBe('dashboard');
  });

  it('rejects skill_frontmatter_missing when no SKILL.md at root', async () => {
    const zip = await buildZip({ 'readme.md': 'no skill here' });
    const app = makeApp(db);
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(zip)], { type: 'application/zip' }), 'empty.zip');
    const res = await app.request('/api/skills', { method: 'POST', headers: authed(), body: fd });
    expect(res.status).toBe(400);
    expect(((await res.json()) as Record<string, unknown>).error).toBe('skill_frontmatter_missing');
  });

  it('rejects skill_name_taken when a row with the same name exists', async () => {
    await seedSkill({ name: 'taken', description: 'd' });
    const zip = await buildZip({
      'SKILL.md': '---\nname: taken\ndescription: dup\n---\n\nbody',
    });
    const app = makeApp(db);
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(zip)], { type: 'application/zip' }), 'taken.zip');
    const res = await app.request('/api/skills', { method: 'POST', headers: authed(), body: fd });
    expect(res.status).toBe(409);
    expect(((await res.json()) as Record<string, unknown>).error).toBe('skill_name_taken');
  });

  it('rejects skill_path_invalid when zip contains a `..` entry', async () => {
    // archiver normalizes paths so `..` is sanitized at archive-time.
    // Build a low-level zip via fflate to inject the unsafe path verbatim.
    const { zipSync, strToU8 } = await import('fflate');
    const zip = Buffer.from(
      zipSync({
        'SKILL.md': strToU8('---\nname: badpath\ndescription: d\n---\n\nbody'),
        '../escape.txt': strToU8('rogue'),
      } as Record<string, Uint8Array>),
    );
    const app = makeApp(db);
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(zip)], { type: 'application/zip' }), 'rogue.zip');
    const res = await app.request('/api/skills', { method: 'POST', headers: authed(), body: fd });
    expect(res.status).toBe(400);
    expect(((await res.json()) as Record<string, unknown>).error).toBe('skill_path_invalid');
  });

  it('rejects skill_file_too_large when a single file exceeds 1MB', async () => {
    const big = 'x'.repeat(1_100_000);
    const zip = await buildZip({
      'SKILL.md': '---\nname: big\ndescription: d\n---\n\nbody',
      'big.txt': big,
    });
    const app = makeApp(db);
    const fd = new FormData();
    fd.append('file', new Blob([new Uint8Array(zip)], { type: 'application/zip' }), 'big.zip');
    const start = Date.now();
    const res = await app.request('/api/skills', { method: 'POST', headers: authed(), body: fd });
    const elapsed = Date.now() - start;
    expect(res.status).toBe(413);
    expect(((await res.json()) as Record<string, unknown>).error).toBe('skill_file_too_large');
    // The unzipper autodrain gotcha: the request must finalize promptly,
    // not stall on the abandoned entry.
    expect(elapsed).toBeLessThan(5000);
  });
});

describe('PATCH /api/skills/:id (description-only)', () => {
  it('updates description for source=dashboard', async () => {
    const skill = await seedSkill({ name: 'a', description: 'old' });
    const app = makeApp(db);
    const res = await app.request(`/api/skills/${skill.id}`, {
      method: 'PATCH',
      headers: authed({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ description: 'new' }),
    });
    expect(res.status).toBe(200);
    expect(skillRepo.get(skill.id)?.description).toBe('new');
  });

  it('returns 403 skill_source_immutable for source=zeno_default', async () => {
    const skill = await seedSkill({ name: 'z', description: 'd', source: 'zeno_default' });
    const app = makeApp(db);
    const res = await app.request(`/api/skills/${skill.id}`, {
      method: 'PATCH',
      headers: authed({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ description: 'new' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 403 skill_source_immutable for source=profile', async () => {
    const skill = await seedSkill({ name: 'p', description: 'd', source: 'profile' });
    const app = makeApp(db);
    const res = await app.request(`/api/skills/${skill.id}`, {
      method: 'PATCH',
      headers: authed({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ description: 'new' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/skills/:id', () => {
  it('deletes the row + canonical FS dir for source=dashboard', async () => {
    const skill = await seedSkill({ name: 'a', description: 'd' });
    const canonical = skillRepo.canonicalPath(skill);
    const app = makeApp(db);
    const res = await app.request(`/api/skills/${skill.id}`, {
      method: 'DELETE',
      headers: authed(),
    });
    expect(res.status).toBe(204);
    expect(skillRepo.get(skill.id)).toBeNull();
    await expect(stat(canonical)).rejects.toThrow();
  });

  it('deletes the row but LEAVES canonical FS for source=profile (read-only mount)', async () => {
    const skill = await seedSkill({ name: 'p', description: 'd', source: 'profile' });
    const canonical = skillRepo.canonicalPath(skill);
    const app = makeApp(db);
    const res = await app.request(`/api/skills/${skill.id}`, {
      method: 'DELETE',
      headers: authed(),
    });
    expect(res.status).toBe(204);
    expect(skillRepo.get(skill.id)).toBeNull();
    // FS dir remains
    const st = await stat(canonical);
    expect(st.isDirectory()).toBe(true);
  });

  it('returns 403 skill_source_immutable for source=zeno_default', async () => {
    const skill = await seedSkill({ name: 'z', description: 'd', source: 'zeno_default' });
    const app = makeApp(db);
    const res = await app.request(`/api/skills/${skill.id}`, {
      method: 'DELETE',
      headers: authed(),
    });
    expect(res.status).toBe(403);
    expect(skillRepo.get(skill.id)).not.toBeNull();
  });
});
