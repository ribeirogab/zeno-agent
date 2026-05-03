---
feature: skills
plan: "[[plan-skills]]"
spec: "[[spec-skills]]"
created: 2026-04-28
---
# Skills — Tasks

**For this plan:** `[[plan-skills]]`

> **Branch:** `feat/skills` (já criado em `802240f`).
> **Contract carry-over:** 3-clean-reviews por phase + final batch review. Paper-first em Phase C (apps/design twin antes de apps/dashboard, 3-clean-reviews por tela contra Paper).

## Phase A: Storage layer

### Task A.1: Migration 11 — skills, connector_skills, agent_capabilities

- [ ] Edit `packages/storage/src/migrations.ts`: adicionar migration 11 ao array `MIGRATIONS`. SQL:
  ```sql
  CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);

  CREATE TABLE IF NOT EXISTS connector_skills (
    connector_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (connector_id, skill_id),
    FOREIGN KEY (connector_id) REFERENCES connectors(id) ON DELETE CASCADE,
    FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_connector_skills_skill ON connector_skills(skill_id);

  CREATE TABLE IF NOT EXISTS agent_capabilities (
    tool_name TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Seed Claude Agent SDK built-in non-MCP tools, all disabled by default.
  -- Operator opts in per-tool via /settings (Phase C). Tools added by future
  -- SDK versions need a new migration to seed; gate denies until then.
  INSERT OR IGNORE INTO agent_capabilities (tool_name, enabled) VALUES
    ('Read', 0),
    ('Edit', 0),
    ('Write', 0),
    ('Bash', 0),
    ('Glob', 0),
    ('Grep', 0),
    ('WebFetch', 0),
    ('WebSearch', 0),
    ('Task', 0);
  ```
- [ ] Edit `packages/storage/tests/migrations.test.ts`: novo describe `migration 11` que `runMigrations(db)` then asserts:
  - `skills` table exists with cols `id, name, description, body, created_at, updated_at`.
  - `connector_skills` table exists with cols `connector_id, skill_id, created_at`.
  - `agent_capabilities` table exists with cols `tool_name, enabled, updated_at`.
  - 9 seed rows in `agent_capabilities`, all `enabled=0`.
  - Re-running `runMigrations(db)` is idempotent (no errors, no duplicate seeds).
- [ ] Run: `pnpm --filter @zeno/storage run test tests/migrations.test.ts` — green.

### Task A.2: Types

- [ ] Edit `packages/storage/src/types.ts`: adicionar:
  ```ts
  export interface Skill {
    id: string;
    name: string;
    description: string;
    body: string;
    createdAt: string;
    updatedAt: string;
  }

  export interface CreateSkillInput {
    name: string;
    description: string;
    body: string;
  }

  export interface UpdateSkillInput {
    description?: string;
    body?: string;
  }

  export interface ConnectorSkillLink {
    connectorId: string;
    skillId: string;
    createdAt: string;
  }

  export interface AgentCapability {
    toolName: string;
    enabled: boolean;
    updatedAt: string;
  }

  export interface AgentCapabilityUpdate {
    toolName: string;
    enabled: boolean;
  }
  ```

### Task A.3: SkillRepo

- [ ] Create `packages/storage/src/repos/skills.ts`. Methods:
  - `list(): Skill[]` — `ORDER BY name ASC`.
  - `get(id): Skill | null`
  - `getByName(name): Skill | null`
  - `create(input: CreateSkillInput): Skill` — generates UUID v4 for id; throws on UNIQUE violation (name conflict).
  - `update(id, input: UpdateSkillInput): Skill | null` — touches `updated_at = datetime('now')`.
  - `delete(id): boolean` — returns true if row was deleted.
- [ ] Create `packages/storage/tests/repos/skills.test.ts` covering: create + get + getByName + list (ordering); duplicate name throws (UNIQUE); update touches `updated_at`; delete returns true on success and false on missing id.
- [ ] Edit `packages/storage/src/index.ts`: export `SkillRepo` + types.
- [ ] Run: `pnpm --filter @zeno/storage run test tests/repos/skills.test.ts` — green.

### Task A.4: ConnectorSkillRepo

- [ ] Create `packages/storage/src/repos/connector-skills.ts`. Methods:
  - `listForConnector(connectorId): Skill[]` — JOIN `connector_skills` ↔ `skills`, ORDER BY `skills.name ASC`.
  - `listForSkill(skillId): { connectorId: string }[]` — used by skill detail page to show read-only "linked connectors".
  - `replaceForConnector(connectorId, skillIds: string[]): void` — atomic: DELETE all for connectorId, INSERT new pairs in one transaction. Skips rows where the skill_id doesn't exist (defensive).
  - `add(connectorId, skillId): void`
  - `remove(connectorId, skillId): boolean`
- [ ] Create `packages/storage/tests/repos/connector-skills.test.ts` covering:
  - link N skills to a connector → `listForConnector` returns them.
  - `replaceForConnector` empties the link list when called with `[]`.
  - `replaceForConnector` is atomic (test that prior links are gone after replace).
  - DELETE on `connectors` cascades to `connector_skills` (via FK ON DELETE CASCADE). Same for `skills`.
- [ ] Edit `packages/storage/src/index.ts`: export `ConnectorSkillRepo`.
- [ ] Run: `pnpm --filter @zeno/storage run test tests/repos/connector-skills.test.ts` — green.

### Task A.5: AgentCapabilityRepo

- [ ] Create `packages/storage/src/repos/agent-capabilities.ts`. Methods:
  - `list(): AgentCapability[]` — `ORDER BY tool_name ASC`.
  - `isEnabled(toolName): boolean` — returns false if row doesn't exist (safe-by-default).
  - `setEnabled(toolName, enabled): void` — UPDATE only (no INSERT — seeds are immutable list); throws if `toolName` not in seed list.
  - `setMany(updates: AgentCapabilityUpdate[]): void` — atomic batch update for the settings page.
- [ ] Create `packages/storage/tests/repos/agent-capabilities.test.ts` covering:
  - After `runMigrations`, 9 seed rows exist all enabled=0.
  - `isEnabled('Bash')` returns false initially; after `setEnabled('Bash', true)` returns true.
  - `isEnabled('NonexistentTool')` returns false (safe default).
  - `setEnabled('NonexistentTool', true)` throws.
  - `setMany([...])` updates rows in one transaction.
- [ ] Edit `packages/storage/src/index.ts`: export `AgentCapabilityRepo`.
- [ ] Run: `pnpm --filter @zeno/storage run test tests/repos/agent-capabilities.test.ts` — green.

### Task A.6: Phase A verify + commit

- [ ] Run: `pnpm --filter @zeno/storage run typecheck` — green.
- [ ] Run: `pnpm --filter @zeno/storage run test` — all storage tests green.
- [ ] **Phase A 3-round review** (per contract): self-grep for placeholders, type holes, schema mismatches against spec. 3 consecutive clean rounds before commit.
- [ ] Commit:
  ```
  feat(storage): skills + connector_skills + agent_capabilities tables (spec 0052 phase A)

  Migration 11 introduces:
  - skills(id, name UNIQUE, description, body, created_at, updated_at)
  - connector_skills(connector_id, skill_id) M:N with ON DELETE CASCADE
  - agent_capabilities(tool_name PK, enabled BOOLEAN) seeded with 9
    Claude Agent SDK built-in non-MCP tools, all disabled by default.

  Three new repos: SkillRepo (CRUD), ConnectorSkillRepo (M:N with
  replaceForConnector for atomic update), AgentCapabilityRepo
  (isEnabled + setMany).

  Per spec 0052 brainstorm v2: no per-skill allowed_tools — capabilities
  are global, operator toggles in /settings (Phase C).
  ```

## Phase B: Worker runtime

### Task B.0 (gate-zero): Validate SDK auto-discovery

> **Critical first task — blocks everything else in Phase B.**

- [ ] Create a test SKILL.md at `${claudeHome}/skills/test-discovery/SKILL.md` (manually for the gate-zero test, NOT via repo) with:
  ```markdown
  ---
  name: test-discovery
  description: Marker skill — if you see this, auto-discovery worked.
  ---
  # Test
  Marker content.
  ```
- [ ] Add a temporary diagnostic test at `apps/worker/tests/agent/sdk-skills-discovery.spike.test.ts`:
  - Spawn a Claude Agent SDK query with prompt: *"List the skills you have available. Reply with a JSON array of names."*.
  - Assert the response includes `'test-discovery'` OR check that `tool_search` shows it.
  - Run: `pnpm --filter @zeno/worker run test tests/agent/sdk-skills-discovery.spike.test.ts`.
- [ ] Decision:
  - **Test passes (Path A — auto-discovery confirmed)**: delete the spike test. Add a 1-line comment in `apps/worker/src/agent/mcp-build.ts` near the top: `// spec 0052: SDK auto-descobre ~/.claude/skills/ — não há tool MCP custom (Path A confirmed YYYY-MM-DD)`. Future tasks assume Path A.
  - **Test fails (Path B — auto-discovery NOT working)**: keep the spike test as committed evidence under `apps/worker/tests/agent/`. Phase B.4 (new sub-task — see below) registers `mcp__zeno__list_skills` + `mcp__zeno__read_skill` in `apps/worker/src/agent/mcp-build.ts` via the in-process MCP factory. Future tasks reference Path B accordingly.
- [ ] Delete the temporary `${claudeHome}/skills/test-discovery/SKILL.md` (cleanup).
- [ ] Commit:
  ```
  chore(worker): SDK auto-discovery gate-zero — Path [A|B] decided (spec 0052)

  Empirical test: spawned Claude Agent SDK query, observed [whether the
  agent saw the marker skill]. Decision: Path [A|B].

  [If Path A]: future tasks assume SDK reads ${claudeHome}/skills/<n>/SKILL.md
  natively. No custom MCP tools needed.

  [If Path B]: B.4 will register mcp__zeno__list_skills +
  mcp__zeno__read_skill in agent/mcp.json's in-process MCP factory.
  ```

### Task B.1: SkillsMaterializer + ProfileWatcher integration

- [ ] Create `apps/worker/src/skills/materialize.ts`:
  ```ts
  import { mkdir, writeFile, rm, readdir } from 'node:fs/promises';
  import { join } from 'node:path';
  import type { Skill, SkillRepo } from '@zeno/storage';
  import type { Logger } from '@zeno/logger';

  export interface MaterializeDeps {
    skillRepo: SkillRepo;
    claudeHome: string;
    logger: Logger;
  }

  /**
   * Sync DB-backed skills to ${claudeHome}/skills/<name>/SKILL.md.
   *
   * Strategy: full reconciliation each call.
   *   1. Read DB skills → expected set of <name> dirs.
   *   2. Read FS dirs in skills/.
   *   3. Delete FS dirs not in expected set (skills deleted in DB).
   *   4. Write/overwrite SKILL.md for each expected skill.
   *
   * Single source of truth: DB. FS is regenerated on every materialize.
   * Spec 0052.
   */
  export async function materializeSkillsToFs(deps: MaterializeDeps): Promise<{ written: number; deleted: number }> {
    const skillsRoot = join(deps.claudeHome, 'skills');
    await mkdir(skillsRoot, { recursive: true });

    const skills = deps.skillRepo.list();
    const expectedNames = new Set(skills.map((s) => s.name));

    let deleted = 0;
    const existing = await readdir(skillsRoot, { withFileTypes: true }).catch(() => []);
    for (const dirent of existing) {
      if (!dirent.isDirectory()) continue;
      if (!expectedNames.has(dirent.name)) {
        await rm(join(skillsRoot, dirent.name), { recursive: true, force: true });
        deleted += 1;
      }
    }

    for (const skill of skills) {
      const dir = join(skillsRoot, skill.name);
      await mkdir(dir, { recursive: true });
      const content = `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${skill.body}`;
      await writeFile(join(dir, 'SKILL.md'), content, 'utf8');
    }

    deps.logger.info({ event: 'skills_materialized', written: skills.length, deleted }, 'skills materialized to FS');
    return { written: skills.length, deleted };
  }
  ```
- [ ] Create `apps/worker/tests/skills/materialize.test.ts`:
  - Setup: in-memory DB + temp claudeHome + mock logger.
  - Test 1: 2 skills in DB → `materializeSkillsToFs` writes 2 `<name>/SKILL.md` files with correct frontmatter + body.
  - Test 2: skill deleted from DB → next materialize removes the FS dir.
  - Test 3: skill body edited in DB → next materialize overwrites the file.
  - Test 4: pre-existing FS dir not in DB → materialize cleans it up.
- [ ] Edit `apps/worker/src/profile/watcher.ts`:
  - Update `classify()`: paths under `${claudeHome}/skills/**` return `'skills'` (currently they're 'ignored').
  - Add `onSkillsChanged?: () => void | Promise<void>` to `ProfileWatcherOptions`.
  - In the debounce dispatch, route `'skills'` events to `onSkillsChanged`.
- [ ] Edit `apps/worker/tests/profile/watcher.test.ts`: add a test `'routes ${claudeHome}/skills/<n>/SKILL.md edits to onSkillsChanged'`. Mirror existing pattern.
- [ ] Edit `apps/worker/src/index.ts`:
  - After `runMigrations(db)` and after the github-app load, add:
    ```ts
    const skillRepo = new SkillRepo(db);
    const connectorSkillRepo = new ConnectorSkillRepo(db);
    const agentCapabilityRepo = new AgentCapabilityRepo(db);
    await materializeSkillsToFs({ skillRepo, claudeHome, logger });
    ```
  - In the `ProfileWatcher` setup, add `onSkillsChanged: async () => { await materializeSkillsToFs({ skillRepo, claudeHome, logger }); await agent.reload(); }`.
- [ ] Run typecheck + watcher tests + materialize tests — green.

### Task B.2: Capabilities-aware gate

- [ ] Edit `apps/worker/src/guardrails/policies/connector-permission.ts`:
  - Update signature: `export function checkConnectorPermission(connectorRepo: ConnectorRepo, agentCapabilityRepo: AgentCapabilityRepo, toolName: string): Decision`.
  - In the non-MCP branch (the first `if (!match)` block), BEFORE the current DENY return, add:
    ```ts
    if (agentCapabilityRepo.isEnabled(toolName)) {
      return {
        allow: true,
        reason: `non-MCP tool '${toolName}' enabled in agent_capabilities`,
        policyThatGated: 'agent_capability_allow',
      };
    }
    ```
  - Update the existing DENY's `reason` to: `non-MCP tool '${toolName}' is disabled — enable in /settings/agent-capabilities or use only connector tools`.
  - Update the existing DENY's `policyThatGated` to: `agent_capability_deny` (was `non_mcp_deny`).
- [ ] Edit `apps/worker/src/guardrails/types.ts` (or wherever `policyThatGated` union lives): add `'agent_capability_allow'` and `'agent_capability_deny'`. Keep `'non_mcp_deny'` for backward compat (legacy log readers) — mark as deprecated comment, do NOT use in new code.
- [ ] Edit `apps/worker/src/guardrails/connector-gated-backend.ts`:
  - Add `agentCapabilityRepo: AgentCapabilityRepo` to the deps interface.
  - In `buildPreToolUseHook` (the single call site), pass `this.deps.agentCapabilityRepo` as the new arg to `checkConnectorPermission`.
- [ ] Edit `apps/worker/src/index.ts`: pass `agentCapabilityRepo` into the `ConnectorGatedBackend` deps.
- [ ] Update existing test `apps/worker/tests/guardrails/connector-permission.test.ts`: every test that calls `checkConnectorPermission(connectorRepo, ...)` now needs `(connectorRepo, agentCapabilityRepo, ...)`. Add a stub repo with an `isEnabled` mock or use a real in-memory DB.
- [ ] Create `apps/worker/tests/guardrails/agent-capabilities.test.ts`:
  - Test 1: capability disabled (default) + non-MCP tool name → DENY with `policyThatGated='agent_capability_deny'`.
  - Test 2: capability enabled → ALLOW with `policyThatGated='agent_capability_allow'`.
  - Test 3: MCP tool name → unchanged behavior (existing logic continues to apply).
  - Test 4: non-MCP tool not in seed list (e.g., `Foo`) → DENY (safe default).
- [ ] Run typecheck + all guardrails tests — green.

### Task B.3: Pre-tool-use hook injection of linked skill bodies

> **Sub-task before coding:** read `@anthropic-ai/claude-agent-sdk` types to confirm the exact return shape for `PreToolUseHookCallback`. Specifically — is there a field like `additionalContext`, `systemPrompt`, or `messages` that the SDK injects before the tool runs? Document the finding inline in `connector-gated-backend.ts` next to the implementation.
>
> If the SDK exposes no injection mechanism in the hook return, fallback: capture the linked-skill bodies in a per-turn cache and prepend them to the next agent message via the existing `agent.send()` path. Document this fallback at the same spot.

- [ ] Read SDK types from `node_modules/@anthropic-ai/claude-agent-sdk/dist/types.d.ts` (or the package's exports). Find the hook return type. Note the field name.
- [ ] If a context-injection field exists (e.g., `additionalContext: string`):
  - Edit `apps/worker/src/guardrails/connector-gated-backend.ts`:
    - Add `connectorSkillRepo: ConnectorSkillRepo` and `skillRepo: SkillRepo` to deps.
    - Inside `buildPreToolUseHook`, after the gate decision returns ALLOW, AND if `toolName` matches `mcp__<slug>__*`:
      ```ts
      const slug = match[1];
      const linkedSkills = this.deps.connectorSkillRepo.listForConnector(this.connectorIdBySlug(slug));
      if (linkedSkills.length === 0) return { ...allowDecision };

      const turnId = ctx.turnId; // or whatever the SDK provides
      const cacheKey = `${turnId}:${slug}`;
      if (this.injectedSkillsCache.has(cacheKey)) return { ...allowDecision };

      const bodies = linkedSkills.map((s) => `## ${s.name}\n\n${s.body}`).join('\n\n---\n\n');
      this.injectedSkillsCache.set(cacheKey, true);
      return {
        ...allowDecision,
        additionalContext: `# Linked skills for ${slug}\n\n${bodies}`,
      };
      ```
    - Add `connectorIdBySlug(slug): string` helper using `connectorRepo.getBySlug(slug)?.id`. Cache the lookup if it shows up in profiling.
    - Add `injectedSkillsCache: Map<string, true>` instance field, cleared at session/turn end if SDK provides such a hook.
- [ ] If NO context-injection field exists, fallback path:
  - Skip the `buildPreToolUseHook` injection.
  - Add a turn-start observer: when a new agent turn begins, scan the operator's prompt for connector slugs (or have a registry of "active connectors per session"); if any have linked skills, prepend the bodies to the user message before sending to the agent. Detail this fallback inline + open a `[NEEDS DESIGN]` block in the file's docstring with options for v2.
- [ ] Create `apps/worker/tests/skills/connector-skill-injection.test.ts`:
  - Setup: connector `sentry` linked to skill `sentry-flow` with body `"how to triage"`.
  - Trigger `buildPreToolUseHook`'s callback with toolName `mcp__sentry__list_issues` and a fake turnId.
  - Assert returned hook result contains the skill body in the relevant field (or, if fallback path, that the prepend mechanism captures it).
  - Repeat call same turnId same slug → assert injection happens only once (cache hit).
- [ ] Run all guardrails + skills tests — green.

### Task B.4 (CONDITIONAL — only if Phase B.0 picked Path B): MCP custom tools

- [ ] *Only execute if B.0 decided Path B.* Edit `apps/worker/src/agent/mcp-build.ts`:
  - Inside the in-process MCP factory (`createSdkMcpServer`), register two tools:
    - `list_skills` → returns `Array<{ name: string, description: string }>` from `skillRepo.list()`.
    - `read_skill(name)` → returns `{ body: string }` from `skillRepo.getByName(name)`. Throws if not found.
- [ ] Edit `apps/worker/tests/agent/mcp-build.test.ts`: add a test asserting `mcp__zeno__list_skills` and `read_skill` are present in the built map when SkillRepo has rows.

### Task B.5: Phase B verify + commit (per sub-phase)

- [ ] Each of B.0/B.1/B.2/B.3 (and B.4 if applicable) ends with: typecheck green + tests green + 3-round review (self) before commit.
- [ ] Commits (1 per sub-phase):
  - `chore(worker): SDK auto-discovery gate-zero — Path [A|B] decided (spec 0052)`
  - `feat(worker): materialize skills DB → ~/.claude/skills/ + watcher hot-reload (spec 0052 phase B.1)`
  - `feat(worker): capabilities-aware gate — non-MCP tools allowed via /settings (spec 0052 phase B.2)`
  - `feat(worker): inject linked-skill bodies via pre-tool-use hook (spec 0052 phase B.3)`
  - *(If Path B)* `feat(worker): mcp__zeno__list_skills + read_skill custom tools (spec 0052 phase B.4)`

## Phase C: API + Dashboard

### Task C.1: API endpoints

- [ ] Create `apps/api/src/routes/skills.ts`:
  - `GET /api/skills` → `Skill[]` (without body, just metadata for list).
  - `GET /api/skills/:id` → full Skill.
  - `POST /api/skills` (multipart with file or JSON with `content` string) → parse frontmatter (Task C.2 dependency), validate, insert. Returns 201 + Skill, or 409 on name conflict (per spec resolved Open Question), or 400 on parse/validate error with structured `{ errors: [{ field, code, message }] }`.
  - `PATCH /api/skills/:id` (JSON `{ content: string }`) → re-parse frontmatter, update body + description (name is immutable in v1; if frontmatter `name` differs, return 400). Returns 200 + Skill.
  - `DELETE /api/skills/:id` → 204. Cascade is automatic via FK.
  - `GET /api/skills/:id/download` → text/markdown, content reconstructed from DB (frontmatter + body).
  - `GET /api/skills/download-all` → application/zip (use `archiver` or `jszip`; `archiver` aligns with existing API deps if present — check `apps/api/package.json`).
- [ ] Create `apps/api/src/routes/connector-skills.ts`:
  - `GET /api/connectors/:id/skills` → `Skill[]` (the connector's linked skills).
  - `PATCH /api/connectors/:id/skills` (JSON `{ skillIds: string[] }`) → `connectorSkillRepo.replaceForConnector(id, skillIds)`. 204.
- [ ] Create `apps/api/src/routes/agent-capabilities.ts`:
  - `GET /api/agent-capabilities` → `AgentCapability[]`.
  - `PATCH /api/agent-capabilities` (JSON `{ updates: AgentCapabilityUpdate[] }`) → `setMany(updates)`. 204.
- [ ] Edit `apps/api/src/server.ts`: register the 3 route modules. Pass repos via deps.
- [ ] Update `apps/api/tests/test-db.ts` (or fixture) to wire up `SkillRepo`, `ConnectorSkillRepo`, `AgentCapabilityRepo`.
- [ ] Create `apps/api/tests/routes/skills.test.ts`: full happy + sad path coverage.
  - POST upload valid → 201.
  - POST upload duplicate name → 409 with body `{ error: 'skill_already_exists', name: '...' }`.
  - POST upload missing description → 400 with `errors: [{ field: 'description', code: 'required' }]`.
  - PATCH body change → 200, body updated, `updated_at` newer.
  - PATCH name change → 400 (immutable).
  - DELETE → 204, GET 404 after.
  - GET download → text/markdown with frontmatter + body recomposed.
  - GET download-all → application/zip with N entries.
- [ ] Create `apps/api/tests/routes/connector-skills.test.ts`:
  - GET empty link list.
  - PATCH replaces atomically.
  - Cascade delete connector → links gone.
- [ ] Create `apps/api/tests/routes/agent-capabilities.test.ts`:
  - GET returns 9 default-disabled rows.
  - PATCH single update flips one.
  - PATCH batch update flips multiple atomically.
  - PATCH unknown tool → 400.

### Task C.2: Frontmatter parser

- [ ] Create `apps/api/src/lib/parse-skill-frontmatter.ts`:
  ```ts
  import { parse as parseYaml } from 'yaml'; // or whatever yaml lib the project already uses

  export interface ParseSuccess {
    ok: true;
    frontmatter: { name: string; description: string };
    body: string;
  }

  export interface ParseFailure {
    ok: false;
    errors: Array<{ field: string; code: string; message: string }>;
  }

  const NAME_REGEX = /^[a-z][a-z0-9-]*$/;
  const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

  export function parseSkillFrontmatter(content: string): ParseSuccess | ParseFailure {
    const errors: ParseFailure['errors'] = [];
    const m = content.match(FRONTMATTER_REGEX);
    if (!m) {
      return {
        ok: false,
        errors: [{ field: 'frontmatter', code: 'missing', message: 'file must start with --- block' }],
      };
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = parseYaml(m[1]) ?? {};
    } catch (err) {
      return {
        ok: false,
        errors: [{ field: 'frontmatter', code: 'invalid_yaml', message: String(err) }],
      };
    }
    const name = parsed.name;
    const description = parsed.description;

    if (typeof name !== 'string' || name.length === 0) {
      errors.push({ field: 'name', code: 'required', message: 'name must be a non-empty string' });
    } else if (!NAME_REGEX.test(name)) {
      errors.push({ field: 'name', code: 'invalid_format', message: 'name must be kebab-case (lowercase, digits, hyphens)' });
    }
    if (typeof description !== 'string' || description.length === 0) {
      errors.push({ field: 'description', code: 'required', message: 'description must be a non-empty string' });
    }
    // Spec 0052: allowed_tools field is intentionally ignored (capabilities are global). Don't validate or pass through.

    if (errors.length > 0) return { ok: false, errors };

    return {
      ok: true,
      frontmatter: { name: name as string, description: description as string },
      body: m[2].trim(),
    };
  }
  ```
- [ ] Create `apps/api/tests/lib/parse-skill-frontmatter.test.ts` covering: valid, missing name, missing description, invalid yaml, no frontmatter block, invalid name format, `allowed-tools` ignored (parses successfully).

### Task C.3: apps/design twin (Paper-first)

> **Per `feedback_screen_review_rule.md`:** each tela = 4 consecutive clean reviews against Paper before commit. Any change → reset counter. One commit per tela.

- [ ] **C.3.a**: Implement `apps/design/src/components/skills/skill-list-row.tsx` — matches Paper artboards S1's table row (no ALLOWED TOOLS column). 4-review loop. Commit.
- [ ] **C.3.b**: `apps/design/src/routes/skills/index.tsx` (S1 + S2) — populated + empty. Hero copy taken from Paper. 4-review loop. Commit.
- [ ] **C.3.c**: `apps/design/src/routes/skills/[id].tsx` (S3 — detail with body markdown left, linked connectors right). 4-review loop. Commit.
- [ ] **C.3.d**: `apps/design/src/components/skills/install-skill-modal.tsx` (M-skill-1 valid + M-skill-1b invalid as states of the same modal — toggle via `state: 'valid' | 'invalid'` prop in design). 4-review loop. Commit.
- [ ] **C.3.e**: `apps/design/src/components/skills/edit-skill-modal.tsx` (M-skill-2). 4-review loop. Commit.
- [ ] **C.3.f**: `apps/design/src/components/skills/delete-skill-modal.tsx` (M-skill-4 — type-to-confirm, cascade preview). 4-review loop. Commit.
- [ ] **C.3.g**: `apps/design/src/components/skills/link-skill-picker-modal.tsx` (M-skill-5). 4-review loop. Commit.
- [ ] **C.3.h**: `apps/design/src/components/skills/linked-skills-section.tsx` (C-skill-1 — embedded section in connector page). 4-review loop. Commit.
- [ ] **C.3.i**: `apps/design/src/components/settings/agent-capabilities-section.tsx` (SET1 — toggles list with sensitive banner). 4-review loop. Commit.

### Task C.4: apps/dashboard

> **Mirror `apps/design`. No visual divergence. Wire to TanStack Query hooks against /api endpoints from C.1.**

- [ ] **C.4.a**: TanStack Query hooks in `apps/dashboard/src/lib/use-skills.ts`. Methods: `useSkills()` (list), `useSkill(id)` (detail), `useInstallSkill()`, `useEditSkill()`, `useDeleteSkill()`. Use the project's `useOptimisticMutation` pattern from `connector-mutations.ts` for delete/edit. Tests as per project convention.
- [ ] **C.4.b**: `apps/dashboard/src/lib/use-agent-capabilities.ts`. `useAgentCapabilities()` + `useUpdateAgentCapabilities()`.
- [ ] **C.4.c**: `apps/dashboard/src/lib/use-connector-skills.ts`. `useConnectorSkills(connectorId)` + `useReplaceConnectorSkills()`.
- [ ] **C.4.d**: `apps/dashboard/src/routes/_authed/skills.tsx` — list page. Imports from `apps/design` style/structure, hooks up real data.
- [ ] **C.4.e**: `apps/dashboard/src/routes/_authed/skills.$id.tsx` — detail page.
- [ ] **C.4.f**: Modais (install / edit / delete / link-picker) — implementam visuals + hooks.
- [ ] **C.4.g**: `apps/dashboard/src/components/skills/linked-skills-section.tsx` — embed in `apps/dashboard/src/routes/_authed/connectors.$id.tsx` above the existing tool permissions section. Per spec C-skill-1 design.
- [ ] **C.4.h**: `apps/dashboard/src/components/settings/agent-capabilities-section.tsx` — embed in `apps/dashboard/src/routes/_authed/settings.tsx` as the first content section above existing `backend`/`mcp servers`/`profile files`. Banner pink when any sensitive tool is enabled.
- [ ] **C.4.i**: `apps/dashboard/src/components/console/sidebar.tsx` — verify `skills` link with `⌘K` exists. If missing, add. Match Paper.
- [ ] Each commit per logical block (e.g., `feat(dashboard): /skills list page`, `feat(dashboard): install + edit + delete modals`, etc.). 3-clean-review loop per commit per the contract.

### Task C.5: Phase C verify + commit

- [ ] Run: `pnpm run quality-gate` — all turbo tasks green (lint + typecheck + tests across all workspaces).
- [ ] **Phase C 3-round review**: independent subagent reviews `git diff feat/skills@phase-b..HEAD` for: stale references to `allowed_tools` flow, missing API endpoints, divergence between `apps/design` and `apps/dashboard`, incorrect hook keys, hardcoded data not wired to API. 3 consecutive clean rounds.
- [ ] Final Phase C commit: `feat: dashboard + API + frontmatter parser for skills (spec 0052 phase C)`.

## Phase D: Verification + delivery

### Task D.1: Quality gate

- [ ] Run: `pnpm run quality-gate`. Expect 30/30 turbo tasks green (lint + typecheck + tests across workspaces — `@zeno/storage`, `@zeno/api`, `@zeno/worker`, `@zeno/dashboard`, `@zeno/design`, `@zeno/logger`, `@zeno/ui`, `@zeno/mcp-discover`, `@zeno/github-app`).

### Task D.2: Docker boot test

- [ ] `PROFILE=fn pnpm run docker:down && pnpm run docker:build && PROFILE=fn pnpm run docker:up`.
- [ ] Wait ~10s for boot.
- [ ] `docker logs zeno-fn-agent-1 --tail 100` — expect:
  - `migrations_applied` (migration 11 runs).
  - `skills_materialized written=N deleted=0`.
  - `agent_capabilities_loaded enabled=[Read,Edit,...]` (or empty if none enabled — that's fine).
  - `mcp_loaded count=4` or `count=5` if Path B added zeno-skills MCP.
  - `connector_gate_enabled` (preserved spec 0050 message).
  - No errors.
- [ ] Open dashboard: http://localhost:3001. Navigate `/skills` (empty state shows hero + dropzone), `/settings` (Agent capabilities section visible with toggles, all OFF), `/connectors/<some-id>` (Linked skills section visible above tool permissions, empty state).
- [ ] Manual smoke test: upload a SKILL.md → modal previews frontmatter → install → skill appears in list → click detail → delete → cascade gone. Toggle Bash in /settings → verify a Slack message that asks for shell command works.

### Task D.3: Final batch 3-round review

- [ ] Round 1 (self): `git diff main..HEAD --stat`. Spot-check every modified file.
- [ ] Round 2 (independent subagent): dispatch `Explore` or `general-purpose` subagent to scan diff for: leftover `allowed_tools` runtime flow, dead imports, type holes, schema mismatch, untested API endpoints, divergence between `apps/design` and `apps/dashboard`, missing skills bucket in profile watcher, stale comments mentioning per-skill scope. Any finding → fix → reset.
- [ ] Round 3 (independent subagent, fresh perspective): regression hunt — boot path, gate logic, hot-reload, hook injection, FS materialize, frontmatter parser, dashboard hooks. Any finding → fix → reset.

### Task D.4: Push + open PR

- [ ] `git push -u origin feat/skills`.
- [ ] `gh pr create --base main --head feat/skills --title "feat: skills runtime + agent capabilities settings (spec 0052)" --body "$(cat <<EOF
## Summary

Reintroduces skills to Zeno's runtime per spec 0052. Markdown playbooks the agent reads on demand; agent capabilities (Read/Edit/Write/Bash/etc.) are global toggles in /settings (no per-skill scoping).

## What changed

- Storage: 3 new tables (\`skills\`, \`connector_skills\`, \`agent_capabilities\`) via migration 11. 3 new repos.
- Worker: SkillsMaterializer (DB → ~/.claude/skills/), ProfileWatcher 'skills' bucket, capabilities-aware connector-permission gate, pre-tool-use hook injects linked-skill bodies before any \`mcp__<connector>__*\` call.
- API: /api/skills CRUD + download/download-all + /api/connectors/:id/skills + /api/agent-capabilities.
- Dashboard: /skills list + detail + install/edit/delete/link-picker modals; /settings now has Agent capabilities section; connector detail page now has Linked skills section.
- Paper-first: 11 artboards approved before implementation (S1/S2/S3, C-skill-1, SET1, M-skill-1, M-skill-1b, M-skill-2, M-skill-4, M-skill-5).

## Verification

- [x] \`pnpm run quality-gate\` — all turbo tasks green.
- [x] Docker boot (PROFILE=fn) clean.
- [x] Phase B gate-zero: SDK auto-discovery confirmed [Path A | Path B].
- [x] 3-round review per phase + final batch (3 consecutive clean).
- [x] E2E via Slack: agent reads skill, executes task with enabled capabilities, no permission errors.

## Test plan

- [ ] Pull, \`pnpm run quality-gate\`, expect green.
- [ ] Boot container, upload a SKILL.md from Paper artboards / skills.sh sample, see it appear in /skills.
- [ ] Toggle Bash in /settings/agent-capabilities, ask agent in Slack to run a shell command, observe success. Toggle off, retry, observe deny with the new error message.
- [ ] Link a skill to Sentry connector, send a Slack message that triggers a Sentry tool call, verify skill body appears in agent context (visible in worker logs).
EOF
)"`.
- [ ] Output PR URL.

## Outside this plan

- Drop \`agent/skills\` runtime usage — already done in spec 0050.
- Drop runtime mentions of per-skill \`allowed_tools\` — already enforced in spec doc updates.
- Re-import legacy \`profiles/<name>/skills/\` — manual operator action; out of scope per spec 0052 Non-Goals.
- skills.sh integration — v2.
- Multi-file skills (assets, sub-md files) — v2.
- always_loaded — v2.
- Pause/disable toggle — v2.
