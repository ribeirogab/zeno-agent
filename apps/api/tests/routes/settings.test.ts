import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CommandRepo,
  CronRepo,
  CronRunRepo,
  type DB,
  LogRepo,
  openDatabase,
  runMigrations,
} from '@zeno/storage';
import { beforeEach, describe, expect, it } from 'vitest';
import { signSession } from '@/auth/hmac';
import { COOKIE_NAME } from '@/auth/middleware';
import { createApp } from '@/server';

const SECRET = '0'.repeat(64);
let db: DB;
let profileDir: string;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  profileDir = mkdtempSync(join(tmpdir(), 'zeno-profile-'));
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
    claudeHome: '/tmp',
    profileDir,
  });
}

function authed(): { Cookie: string } {
  return { Cookie: `${COOKIE_NAME}=${signSession(SECRET, Date.now() + 60_000)}` };
}

describe('GET /api/settings', () => {
  it('rejects without auth', async () => {
    const res = await makeApp(db).request('/api/settings');
    expect(res.status).toBe(401);
  });

  it('returns backend + profile files', async () => {
    writeFileSync(join(profileDir, 'SOUL.md'), '# Zeno');
    writeFileSync(join(profileDir, 'crons.yaml'), 'crons: []');
    const res = await makeApp(db).request('/api/settings', { headers: authed() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      backend: { name: string };
      profileFiles: Array<{ path: string }>;
    };
    expect(body.backend.name).toBe('claude-code');
    const paths = body.profileFiles.map((file) => file.path);
    expect(paths).toContain('SOUL.md');
    expect(paths).toContain('crons.yaml');
  });

  // Spec 0066 A: profile { name, slug } block. Source for `name`
  // is USER.md YAML frontmatter. `slug` comes from ZENO_PROFILE env
  // (set in docker-compose) with a 'default' fallback.

  it('parses profile.name from USER.md frontmatter', async () => {
    writeFileSync(
      join(profileDir, 'USER.md'),
      '---\nname: Operator\ngithub: octocat\n---\n\n# bio',
    );
    const res = await makeApp(db).request('/api/settings', { headers: authed() });
    const body = (await res.json()) as { profile: { name: string | null; slug: string } };
    expect(body.profile.name).toBe('Operator');
    expect(body.profile.slug).toBe('default');
  });

  it('returns profile.name=null when USER.md is missing', async () => {
    const res = await makeApp(db).request('/api/settings', { headers: authed() });
    const body = (await res.json()) as { profile: { name: string | null; slug: string } };
    expect(body.profile.name).toBeNull();
    expect(body.profile.slug).toBe('default');
  });

  it('returns profile.name=null when USER.md has no frontmatter', async () => {
    writeFileSync(join(profileDir, 'USER.md'), '# just a heading\n\nno frontmatter here');
    const res = await makeApp(db).request('/api/settings', { headers: authed() });
    const body = (await res.json()) as { profile: { name: string | null; slug: string } };
    expect(body.profile.name).toBeNull();
  });

  it('returns profile.name=null when frontmatter has no `name:` key', async () => {
    writeFileSync(join(profileDir, 'USER.md'), '---\ngithub: octocat\n---\n\n# bio');
    const res = await makeApp(db).request('/api/settings', { headers: authed() });
    const body = (await res.json()) as { profile: { name: string | null; slug: string } };
    expect(body.profile.name).toBeNull();
  });

  it('reads profile.slug from ZENO_PROFILE env', async () => {
    const previous = process.env.ZENO_PROFILE;
    process.env.ZENO_PROFILE = 'fn';
    try {
      const res = await makeApp(db).request('/api/settings', { headers: authed() });
      const body = (await res.json()) as { profile: { name: string | null; slug: string } };
      expect(body.profile.slug).toBe('fn');
    } finally {
      if (previous === undefined) {
        delete process.env.ZENO_PROFILE;
      } else {
        process.env.ZENO_PROFILE = previous;
      }
    }
  });
});

// Spec 0067 C: POST /api/settings/restart route was removed; the
// dispatcher no longer registers a worker_restart handler. Operators
// who need a hard reset run `docker compose restart` from the host
// (documented on the about tab).

// Spec 0067 B: GET + PUT /api/settings/profile-files/:path. Allowlist
// limits to USER.md only (SOUL.md / crons.yaml stay read-only via the
// listing in GET /api/settings).
describe('GET /api/settings/profile-files/USER.md', () => {
  it('returns the file content + mtime', async () => {
    writeFileSync(join(profileDir, 'USER.md'), '---\nname: Operator\n---\n\n# Bio');
    const res = await makeApp(db).request('/api/settings/profile-files/USER.md', {
      headers: authed(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { path: string; content: string; bytes: number };
    expect(body.path).toBe('USER.md');
    expect(body.content).toContain('name: Operator');
    expect(body.bytes).toBeGreaterThan(0);
  });

  it('returns 404 when USER.md is missing', async () => {
    const res = await makeApp(db).request('/api/settings/profile-files/USER.md', {
      headers: authed(),
    });
    expect(res.status).toBe(404);
  });

  it('returns 403 for non-allowlisted files (SOUL.md)', async () => {
    writeFileSync(join(profileDir, 'SOUL.md'), '# soul');
    const res = await makeApp(db).request('/api/settings/profile-files/SOUL.md', {
      headers: authed(),
    });
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/settings/profile-files/USER.md', () => {
  function putUserMd(database: DB, content: string) {
    return makeApp(database).request('/api/settings/profile-files/USER.md', {
      method: 'PUT',
      headers: { ...authed(), 'content-type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  }

  it('writes and returns mtime+content (200)', async () => {
    const next = '---\nname: Operator (Gabe)\n---\n\nupdated bio.';
    const res = await putUserMd(db, next);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { path: string; content: string; mtime: string };
    expect(body.path).toBe('USER.md');
    expect(body.content).toBe(next);
    // File on disk matches.
    const onDisk = readFileSync(join(profileDir, 'USER.md'), 'utf8');
    expect(onDisk).toBe(next);
  });

  it('rejects non-allowlisted paths with 403', async () => {
    const res = await makeApp(db).request('/api/settings/profile-files/SOUL.md', {
      method: 'PUT',
      headers: { ...authed(), 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'evil' }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects bodies larger than 32 kB with 413', async () => {
    const oversized = 'x'.repeat(32_769);
    const res = await putUserMd(db, oversized);
    expect(res.status).toBe(413);
  });

  it('rejects non-string content with 400', async () => {
    const res = await makeApp(db).request('/api/settings/profile-files/USER.md', {
      method: 'PUT',
      headers: { ...authed(), 'content-type': 'application/json' },
      body: JSON.stringify({ content: 42 }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await makeApp(db).request('/api/settings/profile-files/USER.md', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'no auth' }),
    });
    expect(res.status).toBe(401);
  });
});
