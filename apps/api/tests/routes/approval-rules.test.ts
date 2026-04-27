/**
 * Integration tests for /api/approval-rules. Spec 0047.
 */

import {
  ApprovalRulesRepo,
  CommandRepo,
  ConnectorRepo,
  CronRepo,
  CronRunRepo,
  type DB,
  LogRepo,
  openDatabase,
  runMigrations,
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

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

function makeApp() {
  return createApp({
    config: {
      password: 'pw',
      sessionSecret: SECRET,
      logLevel: 'info',
      workspaceDir: '/tmp',
      nodeEnv: 'test',
      port: 3000,
    },
    db,
    cronRepo: new CronRepo(db),
    cronRunRepo: new CronRunRepo(db),
    commandRepo: new CommandRepo(db),
    logRepo: new LogRepo(db),
    connectorRepo: new ConnectorRepo(db),
    approvalRulesRepo: new ApprovalRulesRepo(db),
    claudeHome: '/tmp',
    profileDir: '/tmp',
  });
}

describe('GET /api/approval-rules', () => {
  it('rejects without auth', async () => {
    const res = await makeApp().request('/api/approval-rules');
    expect(res.status).toBe(401);
  });

  it('returns empty list on empty DB', async () => {
    const res = await makeApp().request('/api/approval-rules', { headers: authed() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns existing rules', async () => {
    new ApprovalRulesRepo(db).create({ pattern: 'mcp__example__delete_*', source: 'manual' });
    const res = await makeApp().request('/api/approval-rules', { headers: authed() });
    const body = (await res.json()) as Array<{ pattern: string; source: string }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.pattern).toBe('mcp__example__delete_*');
    expect(body[0]?.source).toBe('manual');
  });
});

describe('POST /api/approval-rules', () => {
  it('creates a manual rule', async () => {
    const res = await makeApp().request('/api/approval-rules', {
      method: 'POST',
      body: JSON.stringify({ pattern: 'mcp__example__delete_*' }),
      headers: authed(),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { source: string; pattern: string };
    expect(body.source).toBe('manual');
    expect(body.pattern).toBe('mcp__example__delete_*');
  });

  it('rejects malformed pattern with 400', async () => {
    const res = await makeApp().request('/api/approval-rules', {
      method: 'POST',
      body: JSON.stringify({ pattern: 'bad pattern with spaces' }),
      headers: authed(),
    });
    expect(res.status).toBe(400);
  });

  it('returns 409 on duplicate pattern', async () => {
    new ApprovalRulesRepo(db).create({ pattern: 'mcp__example__merge', source: 'manual' });
    const res = await makeApp().request('/api/approval-rules', {
      method: 'POST',
      body: JSON.stringify({ pattern: 'mcp__example__merge' }),
      headers: authed(),
    });
    expect(res.status).toBe(409);
  });

  it('accepts a notes field', async () => {
    const res = await makeApp().request('/api/approval-rules', {
      method: 'POST',
      body: JSON.stringify({ pattern: 'mcp__a__*', notes: 'protect everything' }),
      headers: authed(),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { notes: string | null };
    expect(body.notes).toBe('protect everything');
  });
});

describe('DELETE /api/approval-rules/:id', () => {
  it('removes a manual rule', async () => {
    const repo = new ApprovalRulesRepo(db);
    const r = repo.create({ pattern: 'mcp__example__merge', source: 'manual' });
    const res = await makeApp().request(`/api/approval-rules/${r.id}`, {
      method: 'DELETE',
      headers: authed(),
    });
    expect(res.status).toBe(200);
    expect(repo.get(r.id)).toBeNull();
  });

  it('returns 403 for auto-managed rules', async () => {
    const repo = new ApprovalRulesRepo(db);
    const r = repo.create({ pattern: 'mcp__github-app-acme__merge', source: 'auto' });
    const res = await makeApp().request(`/api/approval-rules/${r.id}`, {
      method: 'DELETE',
      headers: authed(),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('auto_managed_rule');
    // Row should NOT have been deleted.
    expect(repo.get(r.id)).not.toBeNull();
  });

  it('allows deleting yaml-migrated rules', async () => {
    const repo = new ApprovalRulesRepo(db);
    const r = repo.create({ pattern: 'mcp__legacy__*', source: 'yaml-migrated' });
    const res = await makeApp().request(`/api/approval-rules/${r.id}`, {
      method: 'DELETE',
      headers: authed(),
    });
    expect(res.status).toBe(200);
  });

  it('returns 404 for unknown id', async () => {
    const res = await makeApp().request('/api/approval-rules/bogus-id', {
      method: 'DELETE',
      headers: authed(),
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/approval-rules/preview', () => {
  it('returns matching tools for a glob pattern', async () => {
    const connRepo = new ConnectorRepo(db);
    connRepo.create({
      slug: 'github',
      displayName: 'GitHub',
      source: 'catalog',
      catalogId: 'github',
      transport: 'stdio',
      command: 'gh',
      args: ['mcp'],
      secrets: [],
      tools: [
        {
          toolName: 'merge_pull_request',
          description: null,
          category: 'interactive',
          permission: 'ask',
        },
        {
          toolName: 'list_issues',
          description: null,
          category: 'read',
          permission: 'always_allow',
        },
      ],
    });

    const res = await makeApp().request('/api/approval-rules/preview', {
      method: 'POST',
      body: JSON.stringify({ pattern: 'mcp__github__merge_*' }),
      headers: authed(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      matchCount: number;
      samples: string[];
      totalInventory: number;
    };
    expect(body.matchCount).toBe(1);
    expect(body.samples).toEqual(['mcp__github__merge_pull_request']);
    expect(body.totalInventory).toBe(2);
  });

  it('returns 0 matches for a non-matching pattern', async () => {
    const res = await makeApp().request('/api/approval-rules/preview', {
      method: 'POST',
      body: JSON.stringify({ pattern: 'mcp__nope__*' }),
      headers: authed(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { matchCount: number };
    expect(body.matchCount).toBe(0);
  });
});
