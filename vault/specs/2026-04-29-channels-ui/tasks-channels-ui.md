---
feature: channels-ui
plan: "[[plan-channels-ui]]"
spec: "[[spec-channels-ui]]"
created: 2026-04-29
---
# Spec 0059 — Channels UI section in dashboard — Tasks

**For this plan:** `[[plan-channels-ui]]`

> **For agentic workers:** Run tasks in order. Each task is small (≈ 5–15 min). Commit after every task. Phase G (quality gate) runs ONCE at the end of all UI work — don't run it mid-phase.

> **Worktree path:** `/Users/<you>/zeno-agent-worktrees/2026-04-29-channels-ui/`. All paths below are relative to this root unless explicitly absolute. The worktree is on branch `feat/spec-2026-04-29-channels-ui`.

---

## Phase A: API endpoints (Track 1)

Goal: ship 4 new endpoints in `apps/api/src/routes/channels.ts` with 13+ tests, all green.

### Task A.1: GET /api/channels/:id — failing test first

**Files:**
- Modify: `apps/api/tests/routes/channels.test.ts`

- [ ] **Step 1: Add a new `describe` block at the bottom of the file**

```ts
describe('GET /api/channels/:id', () => {
  it('returns channel-shape for a kind=channel row (200)', async () => {
    const { app, repos, cookie } = await buildTestApp();
    const channel = repos.connectors.create({
      slug: 'slack',
      catalogId: 'slack',
      kind: 'channel',
      displayName: 'slack',
      description: null,
      transport: 'remote',
      command: null,
      args: null,
      url: null,
      tools: [],
    });
    repos.connectors.replaceSecrets(channel.id, [
      { key: 'appToken', value: 'xapp-1-aaaa-v0Hk' },
      { key: 'botToken', value: 'xoxb-bbbb-K4xR' },
    ]);

    const res = await app.request(`/api/channels/${channel.id}`, {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: channel.id,
      slug: 'slack',
      catalogId: 'slack',
      displayName: 'slack',
      status: 'pending',
      secrets: [
        { key: 'appToken', masked: true, last4: 'v0Hk' },
        { key: 'botToken', masked: true, last4: 'K4xR' },
      ],
    });
  });

  it('returns 404 for a kind=mcp row', async () => {
    const { app, repos, cookie } = await buildTestApp();
    const mcp = repos.connectors.create({
      slug: 'linear',
      catalogId: 'linear',
      kind: 'mcp',
      displayName: 'linear',
      description: null,
      transport: 'remote',
      command: null,
      args: null,
      url: 'https://mcp.linear.app/sse',
      tools: [],
    });
    const res = await app.request(`/api/channels/${mcp.id}`, { headers: { cookie } });
    expect(res.status).toBe(404);
  });

  it('returns 401 unauthed', async () => {
    const { app } = await buildTestApp();
    const res = await app.request('/api/channels/some-id');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm --filter @zeno/api test -- channels.test.ts`
Expected: 3 NEW failures: `404 returned` or `Cannot GET /api/channels/:id` or similar. The 11 pre-existing tests must STILL pass.

- [ ] **Step 3: Commit (RED)**

```bash
git add apps/api/tests/routes/channels.test.ts
git commit -m "test(api): GET /api/channels/:id — RED (Phase A.1)"
```

### Task A.2: GET /api/channels/:id — implementation

**Files:**
- Modify: `apps/api/src/routes/channels.ts` (currently has GET /catalog, GET /, GET /catalog/icons/:slug)

- [ ] **Step 1: Add the GET /:id handler inside `buildChannelsRoute`**

Find the existing handlers and add (after the list handler):

```ts
route.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = deps.connectors.getById(id);
  if (!row || row.kind !== 'channel') {
    return c.json({ error: 'channel_not_found' }, 404);
  }
  const secrets = deps.connectors.listSecretsMasked(id);
  const catalogEntry = deps.channelsCatalog.entries.find(
    (e) => e.id === row.catalogId,
  );
  return c.json({
    id: row.id,
    slug: row.slug,
    catalogId: row.catalogId,
    displayName: row.displayName,
    description: row.description,
    status: row.status,
    lastError: row.lastError,
    lastErrorAt: row.lastErrorAt,
    lastVerifiedAt: row.lastVerifiedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    iconUrl: catalogEntry?.iconUrl ?? null,
    secrets: secrets.map((s) => ({
      key: s.key,
      masked: true as const,
      last4: s.last4,
    })),
  });
});
```

- [ ] **Step 2: If `ConnectorRepo.listSecretsMasked()` does not exist, add it**

Check `packages/storage/src/repos/connectors.ts`. If missing, add:

```ts
listSecretsMasked(connectorId: string): Array<{ key: string; last4: string }> {
  const rows = this.db
    .prepare(`SELECT key, value FROM connector_secrets WHERE connector_id = ?`)
    .all(connectorId) as Array<{ key: string; value: string }>;
  return rows.map((r) => ({ key: r.key, last4: r.value.slice(-4) }));
}
```

(Verify the existing helper name first — there may already be a `listMaskedSecrets` or similar; reuse instead of duplicating.)

- [ ] **Step 3: Run tests — they should pass**

Run: `pnpm --filter @zeno/api test -- channels.test.ts`
Expected: 14 tests passing (11 existing + 3 new).

- [ ] **Step 4: Commit (GREEN)**

```bash
git add apps/api/src/routes/channels.ts packages/storage/src/repos/connectors.ts
git commit -m "feat(api): GET /api/channels/:id — channel-shape detail response (Phase A.2)"
```

### Task A.3: PATCH /api/channels/:id/secrets — failing test first

**Files:**
- Modify: `apps/api/tests/routes/channels.test.ts`

- [ ] **Step 1: Add `describe` block for PATCH**

```ts
describe('PATCH /api/channels/:id/secrets', () => {
  it('replaces submitted keys with mode=replace (204)', async () => {
    const { app, repos, cookie } = await buildTestApp();
    const channel = repos.connectors.create({
      slug: 'slack', catalogId: 'slack', kind: 'channel',
      displayName: 'slack', description: null, transport: 'remote',
      command: null, args: null, url: null, tools: [],
    });
    repos.connectors.replaceSecrets(channel.id, [
      { key: 'appToken', value: 'xapp-old' },
      { key: 'botToken', value: 'xoxb-old' },
    ]);

    const res = await app.request(`/api/channels/${channel.id}/secrets`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'replace',
        secrets: [{ key: 'appToken', value: 'xapp-NEW' }],
      }),
    });
    expect(res.status).toBe(204);
    const after = repos.connectors.listSecretsMasked(channel.id);
    expect(after.map((s) => s.key)).toEqual(['appToken']);
  });

  it('preserves unchanged keys with mode=merge (REGRESSION TEST)', async () => {
    const { app, repos, cookie } = await buildTestApp();
    const channel = repos.connectors.create({
      slug: 'slack', catalogId: 'slack', kind: 'channel',
      displayName: 'slack', description: null, transport: 'remote',
      command: null, args: null, url: null, tools: [],
    });
    repos.connectors.replaceSecrets(channel.id, [
      { key: 'appToken', value: 'xapp-A-AAAA' },
      { key: 'botToken', value: 'xoxb-B-BBBB' },
    ]);

    const res = await app.request(`/api/channels/${channel.id}/secrets`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'merge',
        secrets: [{ key: 'botToken', value: 'xoxb-B2-CCCC' }],
      }),
    });
    expect(res.status).toBe(204);
    const after = repos.connectors.listSecretsMasked(channel.id);
    const byKey = Object.fromEntries(after.map((s) => [s.key, s.last4]));
    expect(byKey.appToken).toBe('AAAA');  // PRESERVED
    expect(byKey.botToken).toBe('CCCC');  // CHANGED
  });

  it('defaults mode to merge when omitted', async () => {
    const { app, repos, cookie } = await buildTestApp();
    const channel = repos.connectors.create({
      slug: 'slack', catalogId: 'slack', kind: 'channel',
      displayName: 'slack', description: null, transport: 'remote',
      command: null, args: null, url: null, tools: [],
    });
    repos.connectors.replaceSecrets(channel.id, [
      { key: 'appToken', value: 'xapp-A-AAAA' },
      { key: 'botToken', value: 'xoxb-B-BBBB' },
    ]);

    const res = await app.request(`/api/channels/${channel.id}/secrets`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        secrets: [{ key: 'appToken', value: 'xapp-NEW-DDDD' }],
      }),
    });
    expect(res.status).toBe(204);
    const after = repos.connectors.listSecretsMasked(channel.id);
    expect(after).toHaveLength(2);
  });

  it('returns 404 for kind=mcp row', async () => {
    const { app, repos, cookie } = await buildTestApp();
    const mcp = repos.connectors.create({
      slug: 'linear', catalogId: 'linear', kind: 'mcp',
      displayName: 'linear', description: null, transport: 'remote',
      command: null, args: null, url: 'https://mcp.linear.app/sse', tools: [],
    });
    const res = await app.request(`/api/channels/${mcp.id}/secrets`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ secrets: [] }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 401 unauthed', async () => {
    const { app } = await buildTestApp();
    const res = await app.request('/api/channels/some-id/secrets', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secrets: [] }),
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm --filter @zeno/api test -- channels.test.ts`
Expected: 5 PATCH tests fail (handler doesn't exist).

- [ ] **Step 3: Commit (RED)**

```bash
git add apps/api/tests/routes/channels.test.ts
git commit -m "test(api): PATCH /api/channels/:id/secrets — RED (Phase A.3)"
```

### Task A.4: PATCH /api/channels/:id/secrets — implementation

**Files:**
- Modify: `apps/api/src/routes/channels.ts`

- [ ] **Step 1: Add zod schema for the PATCH body**

Top of the file (with other zod imports):

```ts
const patchSecretsSchema = z.object({
  mode: z.enum(['merge', 'replace']).optional().default('merge'),
  secrets: z.array(z.object({
    key: z.string().min(1),
    value: z.string().min(1),
  })),
});
```

- [ ] **Step 2: Add the PATCH handler**

```ts
route.patch('/:id/secrets', zValidator('json', patchSecretsSchema), async (c) => {
  const id = c.req.param('id');
  const row = deps.connectors.getById(id);
  if (!row || row.kind !== 'channel') {
    return c.json({ error: 'channel_not_found' }, 404);
  }
  const { mode, secrets: submitted } = c.req.valid('json');

  let finalSecrets: Array<{ key: string; value: string }>;
  if (mode === 'replace') {
    finalSecrets = submitted;
  } else {
    // mode === 'merge': read existing plaintext, overlay submitted, save merged
    const existing = deps.connectors.listSecretsPlaintext(id);
    const submittedByKey = new Map(submitted.map((s) => [s.key, s.value]));
    const merged = new Map<string, string>();
    for (const s of existing) merged.set(s.key, s.value);
    for (const [k, v] of submittedByKey) merged.set(k, v);
    finalSecrets = Array.from(merged, ([key, value]) => ({ key, value }));
  }

  deps.connectors.replaceSecrets(id, finalSecrets);
  return c.body(null, 204);
});
```

- [ ] **Step 3: Add `listSecretsPlaintext` to ConnectorRepo if missing**

In `packages/storage/src/repos/connectors.ts`:

```ts
listSecretsPlaintext(connectorId: string): Array<{ key: string; value: string }> {
  return this.db
    .prepare(`SELECT key, value FROM connector_secrets WHERE connector_id = ?`)
    .all(connectorId) as Array<{ key: string; value: string }>;
}
```

(This already exists internally for the masked variant — refactor if useful. The route handler must NOT log or return plaintext; it only flows DB → merge → DB.)

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @zeno/api test -- channels.test.ts`
Expected: 19 tests passing (11 existing + 3 GET + 5 PATCH).

- [ ] **Step 5: Commit (GREEN)**

```bash
git add apps/api/src/routes/channels.ts packages/storage/src/repos/connectors.ts
git commit -m "feat(api): PATCH /api/channels/:id/secrets w/ mode=merge default (Phase A.4)"
```

### Task A.5: DELETE /api/channels/:id — failing test first

**Files:**
- Modify: `apps/api/tests/routes/channels.test.ts`

- [ ] **Step 1: Add `describe` block**

```ts
describe('DELETE /api/channels/:id', () => {
  it('deletes the row + cascades secrets (204)', async () => {
    const { app, repos, cookie } = await buildTestApp();
    const channel = repos.connectors.create({
      slug: 'slack', catalogId: 'slack', kind: 'channel',
      displayName: 'slack', description: null, transport: 'remote',
      command: null, args: null, url: null, tools: [],
    });
    repos.connectors.replaceSecrets(channel.id, [
      { key: 'appToken', value: 'xapp-aaaa' },
    ]);

    const res = await app.request(`/api/channels/${channel.id}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    expect(res.status).toBe(204);
    expect(repos.connectors.getById(channel.id)).toBeUndefined();
    // FK CASCADE: secrets row gone too
    expect(repos.connectors.listSecretsMasked(channel.id)).toEqual([]);
  });

  it('returns 404 for kind=mcp row', async () => {
    const { app, repos, cookie } = await buildTestApp();
    const mcp = repos.connectors.create({
      slug: 'linear', catalogId: 'linear', kind: 'mcp',
      displayName: 'linear', description: null, transport: 'remote',
      command: null, args: null, url: 'https://mcp.linear.app/sse', tools: [],
    });
    const res = await app.request(`/api/channels/${mcp.id}`, {
      method: 'DELETE', headers: { cookie },
    });
    expect(res.status).toBe(404);
    expect(repos.connectors.getById(mcp.id)).toBeDefined();  // not deleted
  });

  it('returns 401 unauthed', async () => {
    const { app } = await buildTestApp();
    const res = await app.request('/api/channels/some-id', { method: 'DELETE' });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm --filter @zeno/api test -- channels.test.ts`
Expected: 3 DELETE tests fail.

- [ ] **Step 3: Commit (RED)**

```bash
git add apps/api/tests/routes/channels.test.ts
git commit -m "test(api): DELETE /api/channels/:id — RED (Phase A.5)"
```

### Task A.6: DELETE /api/channels/:id — implementation

**Files:**
- Modify: `apps/api/src/routes/channels.ts`

- [ ] **Step 1: Add the DELETE handler**

```ts
route.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const row = deps.connectors.getById(id);
  if (!row || row.kind !== 'channel') {
    return c.json({ error: 'channel_not_found' }, 404);
  }
  deps.connectors.delete(id);  // FK CASCADE drops connector_secrets
  return c.body(null, 204);
});
```

- [ ] **Step 2: Verify `ConnectorRepo.delete()` exists**

Check `packages/storage/src/repos/connectors.ts`. Per spec it exists at ~line 380. If not, add:

```ts
delete(id: string): void {
  this.db.prepare(`DELETE FROM connectors WHERE id = ?`).run(id);
}
```

(FK CASCADE on `connector_secrets.connector_id` does the rest, confirmed at migration 5.)

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @zeno/api test -- channels.test.ts`
Expected: 22 tests passing.

- [ ] **Step 4: Commit (GREEN)**

```bash
git add apps/api/src/routes/channels.ts packages/storage/src/repos/connectors.ts
git commit -m "feat(api): DELETE /api/channels/:id — sync direct DB delete (Phase A.6)"
```

### Task A.7: GET /api/channels/catalog/setup/:catalogId — failing test first

**Files:**
- Modify: `apps/api/tests/routes/channels.test.ts`

- [ ] **Step 1: Add `describe` block**

```ts
describe('GET /api/channels/catalog/setup/:catalogId', () => {
  it('returns steps + manifest content for slack', async () => {
    const { app, cookie } = await buildTestApp();
    const res = await app.request('/api/channels/catalog/setup/slack', {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      steps: expect.any(Array),
      manifest: {
        filename: 'slack-app-manifest.json',
        content: expect.stringContaining('"name": "zeno-agent"'),
      },
    });
    expect(body.steps.length).toBeGreaterThanOrEqual(3);
  });

  it('returns 404 for unknown catalogId', async () => {
    const { app, cookie } = await buildTestApp();
    const res = await app.request('/api/channels/catalog/setup/nonexistent', {
      headers: { cookie },
    });
    expect(res.status).toBe(404);
  });

  it('returns 401 unauthed', async () => {
    const { app } = await buildTestApp();
    const res = await app.request('/api/channels/catalog/setup/slack');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm --filter @zeno/api test -- channels.test.ts`
Expected: 3 setup tests fail.

- [ ] **Step 3: Commit (RED)**

```bash
git add apps/api/tests/routes/channels.test.ts
git commit -m "test(api): GET /api/channels/catalog/setup/:catalogId — RED (Phase A.7)"
```

### Task A.8: GET /api/channels/catalog/setup/:catalogId — implementation

**Files:**
- Create: `apps/api/src/lib/channel-setup-helpers.ts`
- Modify: `apps/api/src/routes/channels.ts`

- [ ] **Step 1: Build the setup helpers data layer**

Create `apps/api/src/lib/channel-setup-helpers.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export type SetupStep = { index: number; html: string };
export type SetupManifest = { filename: string; content: string };
export type ChannelSetupHelper = {
  steps: SetupStep[];
  manifest: SetupManifest | null;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SLACK_MANIFEST_PATH = path.resolve(
  __dirname,
  '../../../../infra/slack-app-manifest.json',
);

const SLACK_STEPS: SetupStep[] = [
  {
    index: 1,
    html: 'Open <code>api.slack.com/apps</code> → <strong>Create New App</strong> → <strong>From an app manifest</strong> → pick your workspace.',
  },
  {
    index: 2,
    html: 'Paste the manifest below. Review and create the app.',
  },
  {
    index: 3,
    html: 'Generate an <strong>App-Level Token</strong> with scope <code>connections:write</code> and install the bot to your workspace. Copy both tokens here.',
  },
];

export function getChannelSetupHelper(catalogId: string): ChannelSetupHelper | null {
  if (catalogId === 'slack') {
    let content: string;
    try {
      content = readFileSync(SLACK_MANIFEST_PATH, 'utf-8');
    } catch (err) {
      // File not found at runtime — return steps only
      return { steps: SLACK_STEPS, manifest: null };
    }
    return {
      steps: SLACK_STEPS,
      manifest: { filename: 'slack-app-manifest.json', content },
    };
  }
  return null;
}
```

- [ ] **Step 2: Add the route handler**

In `apps/api/src/routes/channels.ts`:

```ts
import { getChannelSetupHelper } from '../lib/channel-setup-helpers';

// ... inside buildChannelsRoute, with other handlers:
route.get('/catalog/setup/:catalogId', async (c) => {
  const catalogId = c.req.param('catalogId');
  const helper = getChannelSetupHelper(catalogId);
  if (!helper) {
    return c.json({ error: 'catalog_entry_not_found' }, 404);
  }
  return c.json(helper);
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @zeno/api test -- channels.test.ts`
Expected: 25 tests passing (11 existing + 3 GET + 5 PATCH + 3 DELETE + 3 setup).

- [ ] **Step 4: Commit (GREEN)**

```bash
git add apps/api/src/lib/channel-setup-helpers.ts apps/api/src/routes/channels.ts
git commit -m "feat(api): GET /api/channels/catalog/setup/:catalogId returns slack manifest (Phase A.8)"
```

---

## Phase B: TanStack Query hooks (apps/dashboard/src/lib/use-channels.ts)

Goal: one file, exporting all channel-related hooks.

### Task B.1: Create use-channels.ts with read hooks

**Files:**
- Create: `apps/dashboard/src/lib/use-channels.ts`

- [ ] **Step 1: Write the file**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api-client';

export type ChannelStatus = 'enabled' | 'disabled' | 'pending';

export type ChannelListItem = {
  id: string;
  slug: string;
  catalogId: string;
  displayName: string;
  description: string | null;
  status: ChannelStatus;
  lastError: string | null;
  lastErrorAt: string | null;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChannelDetail = ChannelListItem & {
  iconUrl: string | null;
  secrets: Array<{ key: string; masked: true; last4: string }>;
};

export type ChannelCatalogEntry = {
  id: string;
  displayName: string;
  description: string | null;
  iconUrl: string | null;
  transport: string;
  secrets: Array<{
    key: string;
    label: string;
    help?: string;
    required: boolean;
    inputType?: 'text' | 'password';
  }>;
  setupHelperKey?: string;
};

export type ChannelSetupHelper = {
  steps: Array<{ index: number; html: string }>;
  manifest: { filename: string; content: string } | null;
};

export const channelsKeys = {
  all: ['channels'] as const,
  list: () => [...channelsKeys.all] as const,
  detail: (id: string) => [...channelsKeys.all, id] as const,
  catalog: () => [...channelsKeys.all, 'catalog'] as const,
  setupHelper: (catalogId: string) =>
    [...channelsKeys.all, 'catalog', 'setup', catalogId] as const,
};

export function useChannels() {
  return useQuery({
    queryKey: channelsKeys.list(),
    queryFn: () => apiFetch<ChannelListItem[]>('/api/channels'),
  });
}

export function useChannel(id: string) {
  return useQuery({
    queryKey: channelsKeys.detail(id),
    queryFn: () => apiFetch<ChannelDetail>(`/api/channels/${id}`),
  });
}

export function useChannelsCatalog() {
  return useQuery({
    queryKey: channelsKeys.catalog(),
    queryFn: async () => {
      // GET /api/channels/catalog returns { channels: [...] } — wrapped, NOT a flat array
      const wrapped = await apiFetch<{ channels: ChannelCatalogEntry[] }>(
        '/api/channels/catalog',
      );
      return wrapped.channels;
    },
  });
}

export function useChannelSetupHelper(catalogId: string | null) {
  return useQuery({
    queryKey: catalogId ? channelsKeys.setupHelper(catalogId) : ['channels', 'setup', 'none'],
    queryFn: () =>
      apiFetch<ChannelSetupHelper>(`/api/channels/catalog/setup/${catalogId}`),
    enabled: catalogId !== null,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/lib/use-channels.ts
git commit -m "feat(dashboard): channels query hooks — list, detail, catalog, setup helper (Phase B.1)"
```

### Task B.2: Add mutation hooks (install, edit secrets, uninstall)

**Files:**
- Modify: `apps/dashboard/src/lib/use-channels.ts`

- [ ] **Step 1: Append mutations to the file**

```ts
type InstallChannelInput = {
  catalogId: string;
  secrets: Array<{ key: string; value: string }>;
};

export function useInstallChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InstallChannelInput) =>
      apiFetch<void>('/api/connectors', {
        method: 'POST',
        body: JSON.stringify({
          source: 'catalog',
          kind: 'channel',
          catalogId: input.catalogId,
          secrets: input.secrets,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: channelsKeys.list() });
    },
  });
}

type EditSecretsInput = {
  channelId: string;
  secrets: Array<{ key: string; value: string }>;
  // mode is always 'merge' for the UI; 'replace' is for programmatic clients
};

export function useEditChannelSecrets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EditSecretsInput) =>
      apiFetch<void>(`/api/channels/${input.channelId}/secrets`, {
        method: 'PATCH',
        body: JSON.stringify({ mode: 'merge', secrets: input.secrets }),
      }),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: channelsKeys.detail(input.channelId) });
    },
  });
}

export function useUninstallChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) =>
      apiFetch<void>(`/api/channels/${channelId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: channelsKeys.list() });
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/lib/use-channels.ts
git commit -m "feat(dashboard): channels mutations — install, edit secrets, uninstall (Phase B.2)"
```

---

## Phase C: List page (channels.index.tsx)

### Task C.1: Create channels.index.tsx with empty state

**Files:**
- Create: `apps/dashboard/src/routes/_authed/channels.index.tsx`

- [ ] **Step 1: Reference Paper artboard CH3 (empty state) for spacing/typography/layout**

Use `mcp__plugin_paper-desktop_paper__get_jsx` and `get_computed_styles` against the `Empty state` node in artboard `CH3 · /channels (empty)` to extract exact CSS values. Do NOT eyeball from screenshots.

- [ ] **Step 2: Write the route file**

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useChannels } from '@/lib/use-channels';
import { ChannelsCatalogInstallModal } from '@/components/channels/channels-catalog-install-modal';

export const Route = createFileRoute('/_authed/channels/')({
  component: ChannelsIndex,
});

function ChannelsIndex(): JSX.Element {
  const { data: channels, isLoading } = useChannels();
  const [installOpen, setInstallOpen] = useState(false);

  if (isLoading) return <div />;

  const isEmpty = !channels || channels.length === 0;

  return (
    <div className="flex flex-col gap-10 px-[54px] py-12">
      <PageHeader onInstall={() => setInstallOpen(true)} hideInstallButton={isEmpty} />
      {isEmpty ? (
        <EmptyState onInstall={() => setInstallOpen(true)} />
      ) : (
        <PopulatedState channels={channels} />
      )}
      <ChannelsCatalogInstallModal open={installOpen} onClose={() => setInstallOpen(false)} />
    </div>
  );
}

function PageHeader({ onInstall, hideInstallButton }: { onInstall: () => void; hideInstallButton: boolean }): JSX.Element {
  // styles per Paper CH1 / CH3 — eyebrow, h1, copy, install button
  // ... (see Paper artboard for exact)
}

function EmptyState({ onInstall }: { onInstall: () => void }): JSX.Element {
  // styles per Paper CH3 Empty state node
}

function PopulatedState({ channels }: { channels: ChannelListItem[] }): JSX.Element {
  // styles per Paper CH1 Installed section + Catalog section
  // includes StatusPill (copied from connectors.index.tsx)
  // includes formatRelative (copied from connectors.index.tsx)
}

// StatusPill: copy verbatim from apps/dashboard/src/routes/_authed/connectors.index.tsx
//   variant signature: 'active' | 'error' | 'off' | 'pending'
// DB-status to visualStatus mapping: copy from connectors.index.tsx lines 152-159
// formatRelative(iso): copy from connectors.index.tsx ~line 483
```

(The full file is too long to inline here. Implementer extracts JSX + computed styles from Paper, copies StatusPill + formatRelative + visualStatus mapping from connectors.index.tsx.)

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @zeno/dashboard typecheck`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/routes/_authed/channels.index.tsx
git commit -m "feat(dashboard): /channels index page — list, empty state, install CTA (Phase C.1)"
```

### Task C.2: Verify catalog client-side join works

- [ ] **Step 1: Add the catalog hook + iconUrl join**

In the populated state, fetch both `useChannels()` and `useChannelsCatalog()`, then join client-side:

```tsx
const { data: channels } = useChannels();
const { data: catalog } = useChannelsCatalog();

const enrichedChannels = (channels ?? []).map((ch) => ({
  ...ch,
  iconUrl: catalog?.find((c) => c.id === ch.catalogId)?.iconUrl ?? null,
}));
```

- [ ] **Step 2: Verify icons render in browser (skip if Phase H smoke test will catch it)**

This is Phase H work — for now just confirm typecheck stays green.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/routes/_authed/channels.index.tsx
git commit -m "feat(dashboard): client-side iconUrl join from /api/channels/catalog (Phase C.2)"
```

---

## Phase D: Modal components

### Task D.1: channels-catalog-install-modal.tsx

**Files:**
- Create: `apps/dashboard/src/components/channels/channels-catalog-install-modal.tsx`

- [ ] **Step 1: Copy `connectors/catalog-install-modal.tsx` as the starting point**

```bash
cp apps/dashboard/src/components/connectors/catalog-install-modal.tsx apps/dashboard/src/components/channels/channels-catalog-install-modal.tsx
```

- [ ] **Step 2: Apply the removal audit**

Remove (per spec Track 4):
- `useTestCatalogConnection` import + mutation invocation + `handleTest` handler
- `ResultStrip` component definition + every render of it
- The "test connection" button in the modal Footer
- `customInstallComponent` routing block
- github-app-specific install paths
- References to the connectors-catalog endpoint or MCP-tools rendering

- [ ] **Step 3: Add the Setup helper panel between catalog list and form**

Reference Paper artboard `M-ch-1` Setup helper node for exact styling. Render order: catalog list → Setup helper (when a catalog entry is selected and has manifest data) → secret form.

```tsx
const selectedCatalog = catalog?.find((e) => e.id === selectedCatalogId);
const { data: setupHelper } = useChannelSetupHelper(selectedCatalogId);

return (
  <Dialog open={open} onClose={onClose}>
    {/* Header — per Paper M-ch-1 */}
    {/* Catalog list — per Paper M-ch-1 (Slack with checkmark) */}
    {selectedCatalog && setupHelper && (
      <SetupHelperPanel helper={setupHelper} />
    )}
    {/* Form — secret fields per Paper M-ch-1 */}
    {/* Footer — cancel + install primary */}
  </Dialog>
);
```

`SetupHelperPanel` is a local component that renders steps + the manifest code block with a copy button (uses `navigator.clipboard.writeText(helper.manifest.content)` on click).

- [ ] **Step 4: Wire up the install mutation + polling**

```tsx
const install = useInstallChannel();
const [polling, setPolling] = useState(false);
const qc = useQueryClient();

async function handleSubmit() {
  await install.mutateAsync({
    catalogId: selectedCatalogId,
    secrets: formValues,
  });
  // poll up to 10s for the row to appear
  setPolling(true);
  const start = Date.now();
  while (Date.now() - start < 10_000) {
    const channels = await qc.fetchQuery({ queryKey: channelsKeys.list() });
    if (channels.some((c) => c.catalogId === selectedCatalogId)) {
      toast.success(`${selectedCatalog?.displayName} installed`);
      onClose();
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  toast.info('Install in progress — the channel will appear shortly. Refresh the page if it doesn\'t show within a minute.');
  onClose();
}
```

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @zeno/dashboard typecheck
git add apps/dashboard/src/components/channels/channels-catalog-install-modal.tsx
git commit -m "feat(dashboard): channels-catalog-install-modal w/ Setup helper + polling (Phase D.1)"
```

### Task D.2: channels-edit-secrets-modal.tsx

**Files:**
- Create: `apps/dashboard/src/components/channels/channels-edit-secrets-modal.tsx`

- [ ] **Step 1: Reference Paper artboard `M-ch-2` for layout**

Extract the JSX + styles for: header, two field rows (untouched + changed states), diff hint code block, footer with cancel + save.

- [ ] **Step 2: Build the component**

Key behavior:
- Each input is empty on open. Placeholder shows `currently set · ••••<last4> · leave empty to keep`.
- Submit body sends ONLY keys with non-empty input values.
- Use `useEditChannelSecrets()` mutation.
- On success: toast "secrets updated", close modal.

```tsx
export function ChannelsEditSecretsModal({
  channel,
  catalogEntry,
  open,
  onClose,
}: {
  channel: ChannelDetail;
  catalogEntry: ChannelCatalogEntry;
  open: boolean;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const editSecrets = useEditChannelSecrets();

  async function handleSubmit() {
    const submitted = Object.entries(values)
      .filter(([_, v]) => v.length > 0)
      .map(([key, value]) => ({ key, value }));
    if (submitted.length === 0) {
      onClose(); // nothing to change
      return;
    }
    await editSecrets.mutateAsync({ channelId: channel.id, secrets: submitted });
    toast.success('secrets updated');
    onClose();
  }

  // ... JSX per Paper M-ch-2
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter @zeno/dashboard typecheck
git add apps/dashboard/src/components/channels/channels-edit-secrets-modal.tsx
git commit -m "feat(dashboard): channels-edit-secrets-modal w/ merge mode (Phase D.2)"
```

### Task D.3: channels-uninstall-confirm-dialog.tsx

**Files:**
- Create: `apps/dashboard/src/components/channels/channels-uninstall-confirm-dialog.tsx`

- [ ] **Step 1: Reference Paper artboard `M-ch-3` for layout**

- [ ] **Step 2: Build the component**

```tsx
export function ChannelsUninstallConfirmDialog({
  channel,
  open,
  onClose,
}: {
  channel: ChannelDetail;
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const uninstall = useUninstallChannel();

  async function handleConfirm() {
    await uninstall.mutateAsync(channel.id);
    toast.success(`${channel.displayName} uninstalled`);
    navigate({ to: '/channels' });
  }

  // JSX per Paper M-ch-3:
  // - destructive header strip
  // - title: `Uninstall ${channel.displayName}?`
  // - body: `Bot will stop responding to ${channel.displayName} messages.`
  // - cancel + destructive uninstall buttons
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter @zeno/dashboard typecheck
git add apps/dashboard/src/components/channels/channels-uninstall-confirm-dialog.tsx
git commit -m "feat(dashboard): channels-uninstall-confirm-dialog parameterized by displayName (Phase D.3)"
```

---

## Phase E: Detail page (channels.$id.tsx)

### Task E.1: Create channels.$id.tsx

**Files:**
- Create: `apps/dashboard/src/routes/_authed/channels.$id.tsx`

- [ ] **Step 1: Reference Paper artboard `CH2` for layout**

- [ ] **Step 2: Write the route file**

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useChannel, useChannelsCatalog } from '@/lib/use-channels';
import { ChannelsEditSecretsModal } from '@/components/channels/channels-edit-secrets-modal';
import { ChannelsUninstallConfirmDialog } from '@/components/channels/channels-uninstall-confirm-dialog';

export const Route = createFileRoute('/_authed/channels/$id')({
  component: ChannelDetail,
});

function ChannelDetail(): JSX.Element {
  const { id } = Route.useParams();
  const { data: channel, isLoading } = useChannel(id);
  const { data: catalog } = useChannelsCatalog();
  const [editOpen, setEditOpen] = useState(false);
  const [uninstallOpen, setUninstallOpen] = useState(false);

  if (isLoading || !channel) return <div />;

  const catalogEntry = catalog?.find((c) => c.id === channel.catalogId);

  // visualStatus derivation — copied from connectors.index.tsx lines 152-159
  const visualStatus =
    channel.status === 'enabled'
      ? channel.lastError
        ? 'error'
        : 'active'
      : channel.status === 'disabled'
        ? 'off'
        : 'pending';

  return (
    <div className="flex flex-col gap-10 px-[54px] py-12">
      <Header
        channel={channel}
        visualStatus={visualStatus}
        onUninstall={() => setUninstallOpen(true)}
      />
      <SecretsSection channel={channel} onEdit={() => setEditOpen(true)} />
      <ActivitySection channel={channel} />
      {catalogEntry && (
        <ChannelsEditSecretsModal
          channel={channel}
          catalogEntry={catalogEntry}
          open={editOpen}
          onClose={() => setEditOpen(false)}
        />
      )}
      <ChannelsUninstallConfirmDialog
        channel={channel}
        open={uninstallOpen}
        onClose={() => setUninstallOpen(false)}
      />
    </div>
  );
}

// Header / SecretsSection / ActivitySection: copy styles from Paper CH2

// StatusPill: copy from connectors.index.tsx (variant 'off' not 'disabled')
// formatRelative(iso): copy from connectors.index.tsx ~line 483
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter @zeno/dashboard typecheck
git add apps/dashboard/src/routes/_authed/channels.\$id.tsx
git commit -m "feat(dashboard): /channels/:id detail page — secrets, activity, uninstall (Phase E.1)"
```

---

## Phase F: Sidebar nav (Track 5)

### Task F.1: Add channels to NavId + NAV array

**Files:**
- Modify: `apps/dashboard/src/components/layout/dashboard-sidebar.tsx`

- [ ] **Step 1: Extend `NavId` type union**

Find the type definition and add `'channels'`:

```ts
type NavId = 'home' | 'crons' | 'sessions' | 'channels' | 'connectors' | 'skills' | 'logs' | 'settings';
```

- [ ] **Step 2: Insert `channels` ABOVE `connectors` in the `NAV` array**

```ts
const NAV: Array<{ id: NavId; label: string; to: string; shortcut?: string }> = [
  { id: 'home', label: 'home', to: '/', shortcut: '⌘H' },
  { id: 'crons', label: 'crons', to: '/crons', shortcut: '⌘C' },
  { id: 'sessions', label: 'sessions', to: '/sessions', shortcut: '⌘S' },
  { id: 'channels', label: 'channels', to: '/channels', shortcut: '⌘N' },  // NEW
  { id: 'connectors', label: 'connectors', to: '/connectors', shortcut: '⌘K' },
  { id: 'skills', label: 'skills', to: '/skills', shortcut: '⌘L' },
  { id: 'logs', label: 'logs', to: '/logs' },
  { id: 'settings', label: 'settings', to: '/settings', shortcut: '⌘,' },
];
```

(Verify exact existing shortcut letters before changing them — connectors may have `⌘N` already; reconcile collisions.)

- [ ] **Step 3: Add the path matcher case**

In `navIdForPath()`:

```ts
if (path.startsWith('/channels')) return 'channels';
```

(Insert before the connectors case.)

- [ ] **Step 4: Add the icon to NavIcon switch**

```tsx
case 'channels':
  return (
    <svg {...props}>
      <path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-4 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
    </svg>
  );
```

(Reuse the existing `props` object — `{ width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }`.)

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @zeno/dashboard typecheck
git add apps/dashboard/src/components/layout/dashboard-sidebar.tsx
git commit -m "feat(dashboard): sidebar — channels nav entry above connectors (Phase F.1)"
```

---

## Phase G: Quality gate

### Task G.1: Full quality gate

- [ ] **Step 1: Run the full gate from the worktree root**

Run: `pnpm run quality-gate`
Expected: 30/30 turbo tasks green. 13+ new API tests passing.

- [ ] **Step 2: If any failures, fix and re-run**

Common failure modes:
- Missing `replaceSecrets` / `delete` / `listSecretsPlaintext` on `ConnectorRepo` → add them.
- Type errors in mutation hooks → check `apiFetch` generic signature.
- Missing imports in route files → biome will flag these.

- [ ] **Step 3: Commit any quality-gate fixes**

```bash
git add -A
git commit -m "chore: quality gate fixes (Phase G.1)"
```

---

## Phase H: End-to-end smoke test

### Task H.1: Bring up the default profile container

- [ ] **Step 1: Verify nothing else is running on port 3000**

```bash
lsof -i :3000 || echo "port free"
```

If something is running, ask the operator before proceeding (this PR's worktree shares the docker-compose with main).

- [ ] **Step 2: Start the worker + API**

```bash
pnpm run docker:up
pnpm run docker:logs &
```

Wait for the `[api]` log to show `listening on :3000`.

### Task H.2: Manual UI walkthrough

- [ ] **Step 1: Open http://localhost:3000/channels in a browser**
- [ ] **Step 2: Verify empty state matches Paper CH3 visually**
- [ ] **Step 3: Click "install slack" — modal opens**
- [ ] **Step 4: Verify Setup helper panel renders with manifest content + copy button**
- [ ] **Step 5: Click copy — verify clipboard contains the manifest JSON**
- [ ] **Step 6: Paste real Slack tokens (operator provides) — click Install**
- [ ] **Step 7: Verify polling completes and Slack card appears in list**
- [ ] **Step 8: Click "manage" — detail page opens**
- [ ] **Step 9: Verify secrets section shows masked tokens with last4**
- [ ] **Step 10: Click "edit secrets" — modal opens**
- [ ] **Step 11: Fill ONLY the bot token field (rotate it)**
- [ ] **Step 12: Click save — verify success toast**
- [ ] **Step 13: Refresh detail page — verify appToken last4 unchanged, botToken last4 updated**
- [ ] **Step 14: Click kebab → uninstall — confirm dialog opens**
- [ ] **Step 15: Click destructive uninstall — verify success toast + redirect to empty state**
- [ ] **Step 16: docker:down**

```bash
pnpm run docker:down
```

- [ ] **Step 17: If anything failed in H.2, fix and re-run G + H**

---

## Phase I: 3-round branch review

Per cleanup contract Rule 2: 3 consecutive clean reviews to pass; reset on any BLOCKING finding.

### Task I.1: Round 1

- [ ] **Step 1: Dispatch a code-review subagent**

Brief: review all changes on branch `feat/spec-2026-04-29-channels-ui` since the merge-base with main. Focus on:
- Spec adherence (every section of spec.md has corresponding code)
- TDD discipline (every API endpoint has a failing-then-passing test commit pair)
- StatusPill / formatRelative copy fidelity (must match `connectors.index.tsx` exactly)
- DB-status-to-pill mapping correctness
- Catalog response envelope handling (`{ channels: [...] }`, NOT a flat array)
- PATCH merge regression test exists and asserts both keys
- Polling predicate is `catalogId === submittedCatalogId`
- Sidebar icon stroke pattern matches existing nav icons

Format:
- VERDICT: APPROVED or ISSUES FOUND
- ISSUES FOUND: numbered, BLOCKING/ADVISORY, concrete fix

- [ ] **Step 2: If BLOCKING, fix and reset to Round 1**
- [ ] **Step 3: If APPROVED with advisories, fix advisories inline (don't reset)**

### Task I.2: Round 2 (only after Round 1 clean)

Same brief as I.1. Reviewer is fresh — no anchoring on prior round.

### Task I.3: Round 3 (only after Round 2 clean)

Same brief as I.2. This is the final gate.

---

## Phase J: Push + open PR

### Task J.1: Push the branch

- [ ] **Step 1: Verify branch is clean**

```bash
git status
git log --oneline main..HEAD | wc -l
```

- [ ] **Step 2: Push**

```bash
git push -u origin feat/spec-2026-04-29-channels-ui
```

### Task J.2: Open PR (via /open-pr command)

- [ ] **Step 1: Invoke `/open-pr`**

The command auto-generates title + description from commit history. Target: `main`.

- [ ] **Step 2: Capture the PR URL and report to operator**

---

## Self-Review Checklist

After Phase J, verify against the spec test plan:

- [ ] Phase 0: Paper artboards — DONE in this conversation (CH1, CH2, CH3, M-ch-1, M-ch-2, M-ch-3 in Hearty island)
- [ ] Track 1 API: 4 endpoints implemented, 13+ tests green
- [ ] Track 2 list page: empty + populated states match Paper CH1/CH3
- [ ] Track 3 detail page: header, secrets, activity match Paper CH2
- [ ] Track 4 modals: 3 modals match Paper M-ch-1/2/3, install includes Setup helper
- [ ] Track 5 sidebar: channels nav above connectors, stroke icon matches set
- [ ] Quality gate green (30/30 turbo)
- [ ] E2E smoke test passes against profiles/default
- [ ] 3 consecutive clean branch reviews
- [ ] PR opened against main
