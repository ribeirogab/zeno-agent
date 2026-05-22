---
feature: crons-cli-first
plan: "[[plan-crons-cli-first]]"
spec: "[[spec-crons-cli-first]]"
created: 2026-05-22
---
# Crons CLI-First — Tasks

**For this plan:** [[plan-crons-cli-first]]

> All tasks run from the repo root unless stated. Branch is already created (`feat/crons-cli-first`). Every task ends with `git commit`. Phase boundaries are commit clusters; the PR is opened only after Phase 12.

---

## Phase 1 — DB migration: slim `crons` schema + `cron_runs.session_id`

### Task 1: Add migration SQL + drizzle schema update

**Files:**
- Modify: `packages/db/src/runtime/schema.ts` — slim `crons` columns, add `session_id` to `cron_runs`
- Create: `packages/db/src/runtime/migrations/NNNN_crons_filesystem_truth.sql` (NNNN = next free number)
- Modify: `packages/db/tests/repos/crons.test.ts` — adapt tests to new schema

- [ ] **Step 1: Find the next migration number**

Run: `ls packages/db/src/runtime/migrations/ | sort | tail -3`

Note the highest existing number. The new migration is `<n+1>_crons_filesystem_truth.sql`.

- [ ] **Step 2: Write the migration SQL**

Create `packages/db/src/runtime/migrations/<n+1>_crons_filesystem_truth.sql`:

```sql
-- Clean slate: drop every existing cron row (per spec decision).
-- cron_runs has FK CASCADE on cron_id, but explicit DELETE for clarity.
DELETE FROM cron_runs;
DELETE FROM crons;

-- Drop columns on `crons` whose source of truth moved to the filesystem.
ALTER TABLE crons DROP COLUMN prompt;
ALTER TABLE crons DROP COLUMN source;
ALTER TABLE crons DROP COLUMN created_by;
ALTER TABLE crons DROP COLUMN notify_conversation_id;
ALTER TABLE crons DROP COLUMN notify_thread_id;
ALTER TABLE crons DROP COLUMN created_at;

-- Add columns on `crons` for the reconciler's fast-path and error surface.
ALTER TABLE crons ADD COLUMN content_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE crons ADD COLUMN mtime_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crons ADD COLUMN last_error TEXT;
ALTER TABLE crons ADD COLUMN last_error_at TEXT;

-- Add column on `cron_runs` for the agent session id.
ALTER TABLE cron_runs ADD COLUMN session_id TEXT;
```

- [ ] **Step 3: Update drizzle schema for `crons`**

In `packages/db/src/runtime/schema.ts`, replace the existing `crons` table definition with:

```ts
export const crons = sqliteTable(
  'crons',
  {
    id: text('id').primaryKey(),                  // slug
    name: text('name').notNull(),
    description: text('description'),
    schedule: text('schedule').notNull(),
    enabled: integer('enabled').notNull().default(1),
    contentHash: text('content_hash').notNull().default(''),
    mtimeMs: integer('mtime_ms').notNull().default(0),
    lastRunAt: text('last_run_at'),
    nextRunAt: text('next_run_at'),
    lastError: text('last_error'),
    lastErrorAt: text('last_error_at'),
    updatedAt: text('updated_at').notNull().default(oldTimestamp),
  },
  (table) => ({
    idxEnabledNextRun: index('idx_crons_enabled_next_run').on(table.enabled, table.nextRunAt),
  }),
);
```

- [ ] **Step 4: Update drizzle schema for `cron_runs`**

Add `sessionId: text('session_id')` to the existing `cronRuns` table definition (nullable column, no `notNull()`).

- [ ] **Step 5: Apply the migration locally + verify**

Run: `pnpm --filter @zeno/db build && pnpm --filter @zeno/db test`

Expected: every test passes (any test that used the dropped columns must be updated in Step 6).

- [ ] **Step 6: Rewrite `packages/db/src/runtime/repos/crons.ts` to match the new schema**

Replace mutation methods (`create`, `update`, `pause`, `resume`, `runNow`) with reconciler-friendly ones: `upsertFromFile(slug, parsed)`, `markFailed(slug, error)`, `deleteBySlug(slug)`. Read methods (`list`, `get`, `next`) stay. Remove any reference to `prompt`, `source`, `createdBy`, `notifyConversationId`, `notifyThreadId`, `createdAt`.

Concrete `upsertFromFile` shape:

```ts
upsertFromFile(slug: string, parsed: ParsedCron, mtimeMs: number, contentHash: string) {
  const now = new Date().toISOString();
  return this.db
    .insert(crons)
    .values({
      id: slug,
      name: parsed.name,
      description: parsed.description ?? null,
      schedule: parsed.schedule,
      enabled: parsed.enabled ? 1 : 0,
      contentHash,
      mtimeMs,
      lastError: null,
      lastErrorAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: crons.id,
      set: {
        name: parsed.name,
        description: parsed.description ?? null,
        schedule: parsed.schedule,
        enabled: parsed.enabled ? 1 : 0,
        contentHash,
        mtimeMs,
        lastError: null,
        lastErrorAt: null,
        updatedAt: now,
      },
    })
    .run();
}
```

- [ ] **Step 7: Update / write tests**

In `packages/db/tests/repos/crons.test.ts`, replace existing CRUD tests with:

```ts
it("upsertFromFile inserts a new row and updates on conflict", async () => {
  const repo = makeRepo();
  repo.upsertFromFile("send-hello", {
    name: "Send hello",
    description: null,
    schedule: "0 9 * * 1-5",
    enabled: true,
    body: "Say hello",
  }, 1000, "hash1");
  expect(repo.get("send-hello")?.name).toBe("Send hello");

  repo.upsertFromFile("send-hello", {
    name: "Send hello (v2)",
    description: "updated",
    schedule: "0 10 * * 1-5",
    enabled: false,
    body: "Say hello differently",
  }, 2000, "hash2");
  const row = repo.get("send-hello");
  expect(row?.name).toBe("Send hello (v2)");
  expect(row?.contentHash).toBe("hash2");
  expect(row?.enabled).toBe(0);
});

it("deleteBySlug cascades to cron_runs", async () => {
  const repo = makeRepo();
  repo.upsertFromFile("x", { name: "X", description: null, schedule: "* * * * *", enabled: true, body: "x" }, 1, "h");
  // insert a run row directly via lower-level call
  repo.recordRun("x", { status: "passed", sessionId: "sess_1", startedAt: new Date().toISOString(), completedAt: new Date().toISOString() });
  repo.deleteBySlug("x");
  expect(repo.list()).toHaveLength(0);
  // Verify cron_runs is empty:
  const runs = repo.db.select().from(cronRuns).all();
  expect(runs).toHaveLength(0);
});
```

- [ ] **Step 8: Run tests, expect PASS**

Run: `pnpm --filter @zeno/db test`
Expected: every test passes.

- [ ] **Step 9: Commit**

```bash
git add packages/db/
git commit -m "feat(db): slim crons schema + cron_runs.session_id (filesystem source of truth)"
```

---

## Phase 2 — Profile templates: `_README.md` + `_template/CRON.md`

### Task 2: Create the templates dir and files

**Files:**
- Create: `templates/profile/crons/_README.md`
- Create: `templates/profile/crons/_template/CRON.md`

- [ ] **Step 1: Create the directory + write `_README.md`**

```bash
mkdir -p templates/profile/crons/_template
```

Write `templates/profile/crons/_README.md` with the verbatim content drafted in spec section A3 (operator-facing guide: layout, how-the-worker-uses-it, frontmatter table, CLI command reference, privacy).

- [ ] **Step 2: Write the blank CRON.md scaffold**

`templates/profile/crons/_template/CRON.md`:

```markdown
---
name: Example cron
description: Short summary of what this cron does
schedule: 0 9 * * 1-5
enabled: false
---
Replace this body with the prompt the agent should run on the schedule above.
You can reference files via Bash (your working dir is /app/crons/<this-slug>/),
e.g. `cat scripts/payload.json`.
```

- [ ] **Step 3: Commit**

```bash
git add templates/profile/crons/
git commit -m "feat(templates): add per-profile crons/ scaffold (_README.md + _template)"
```

### Task 3: Wire profile-create to scaffold the crons folder

**Files:**
- Modify: `apps/cli/src/commands/profile-create.ts` — copy `templates/profile/crons/` into the new profile dir
- Modify: `apps/cli/tests/commands/profile-create.test.ts` — add assertion

- [ ] **Step 1: Find the existing knowledge-copy logic**

Run: `grep -n "templates/profile/knowledge" apps/cli/src/commands/profile-create.ts`
Note the surrounding pattern (a `cp -R` or fs.cp call).

- [ ] **Step 2: Add the failing test**

In `apps/cli/tests/commands/profile-create.test.ts`:

```ts
it("creates a crons/ folder with _README.md and _template/CRON.md", async () => {
  const profile = `test-${Date.now()}`;
  await runProfileCreate(profile);
  const cronsDir = path.join(profileDir(profile), "crons");
  expect(fs.existsSync(path.join(cronsDir, "_README.md"))).toBe(true);
  expect(fs.existsSync(path.join(cronsDir, "_template/CRON.md"))).toBe(true);
});
```

- [ ] **Step 3: Run test, expect FAIL**

Run: `pnpm --filter @zeno/cli test -t "creates a crons/"`
Expected: FAIL.

- [ ] **Step 4: Add the copy logic**

In `apps/cli/src/commands/profile-create.ts`, alongside the knowledge copy, add:

```ts
await fs.promises.cp(
  path.join(repoRoot(), "templates/profile/crons"),
  path.join(profileDir(name), "crons"),
  { recursive: true },
);
```

- [ ] **Step 5: Run test, expect PASS**

Run: `pnpm --filter @zeno/cli test -t "creates a crons/"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/cli/
git commit -m "feat(cli): scaffold per-profile crons/ folder on profile create"
```

---

## Phase 3 — Worker frontmatter parser

### Task 4: Add `gray-matter` + `cron-parser` deps to worker

**Files:**
- Modify: `apps/worker/package.json`

- [ ] **Step 1: Add deps**

```bash
pnpm add gray-matter cron-parser -F @zeno/worker
pnpm install
```

- [ ] **Step 2: Verify**

Run: `grep -E "gray-matter|cron-parser" apps/worker/package.json`
Expected: both listed.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/package.json pnpm-lock.yaml
git commit -m "chore(worker): add gray-matter + cron-parser deps for cron filesystem parser"
```

### Task 5: Implement `apps/worker/src/cron/frontmatter.ts`

**Files:**
- Create: `apps/worker/src/cron/frontmatter.ts`
- Create: `apps/worker/tests/cron/frontmatter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/worker/tests/cron/frontmatter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseCronFile } from "../../src/cron/frontmatter.js";

describe("parseCronFile", () => {
  it("parses a valid CRON.md", () => {
    const raw = `---
name: Send hello
schedule: 0 9 * * 1-5
enabled: true
---
Say hello to the workspace.
`;
    const r = parseCronFile(raw);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.value.name).toBe("Send hello");
      expect(r.value.schedule).toBe("0 9 * * 1-5");
      expect(r.value.enabled).toBe(true);
      expect(r.value.body.trim()).toBe("Say hello to the workspace.");
    }
  });

  it("rejects invalid YAML", () => {
    const r = parseCronFile("---\nname: [unclosed\n---\nbody");
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.code).toBe("invalid_yaml");
  });

  it("rejects missing required name", () => {
    const r = parseCronFile("---\nschedule: '* * * * *'\nenabled: true\n---\nbody");
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.code).toBe("missing_name");
  });

  it("rejects invalid schedule", () => {
    const r = parseCronFile("---\nname: x\nschedule: 'not-a-cron'\nenabled: true\n---\nbody");
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.code).toBe("invalid_schedule");
  });

  it("rejects non-boolean enabled", () => {
    const r = parseCronFile("---\nname: x\nschedule: '* * * * *'\nenabled: 'yes'\n---\nbody");
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.code).toBe("invalid_enabled_flag");
  });

  it("rejects empty body", () => {
    const r = parseCronFile("---\nname: x\nschedule: '* * * * *'\nenabled: true\n---\n\n\n");
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.code).toBe("empty_prompt");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @zeno/worker test -t "parseCronFile"`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the parser**

Create `apps/worker/src/cron/frontmatter.ts`:

```ts
import matter from "gray-matter";
import { CronExpressionParser } from "cron-parser";

export interface ParsedCron {
  name: string;
  description: string | null;
  schedule: string;
  enabled: boolean;
  body: string;
}

export type ParseError =
  | "invalid_yaml"
  | "missing_name"
  | "invalid_schedule"
  | "invalid_enabled_flag"
  | "empty_prompt";

export type ParseResult =
  | { kind: "ok"; value: ParsedCron }
  | { kind: "error"; code: ParseError; message: string };

export function parseCronFile(raw: string): ParseResult {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(raw);
  } catch (err) {
    return { kind: "error", code: "invalid_yaml", message: (err as Error).message };
  }
  const data = parsed.data as Record<string, unknown>;
  if (typeof data.name !== "string" || data.name.trim() === "") {
    return { kind: "error", code: "missing_name", message: "name must be a non-empty string" };
  }
  if (typeof data.schedule !== "string" || data.schedule.trim() === "") {
    return { kind: "error", code: "invalid_schedule", message: "schedule must be a cron expression string" };
  }
  try {
    CronExpressionParser.parse(data.schedule);
  } catch (err) {
    return { kind: "error", code: "invalid_schedule", message: (err as Error).message };
  }
  if (typeof data.enabled !== "boolean") {
    return { kind: "error", code: "invalid_enabled_flag", message: "enabled must be a strict boolean" };
  }
  if (parsed.content.trim() === "") {
    return { kind: "error", code: "empty_prompt", message: "body must contain at least one non-blank line" };
  }
  const description = typeof data.description === "string" ? data.description : null;
  return {
    kind: "ok",
    value: {
      name: data.name,
      description,
      schedule: data.schedule,
      enabled: data.enabled,
      body: parsed.content,
    },
  };
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm --filter @zeno/worker test -t "parseCronFile"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/cron/frontmatter.ts apps/worker/tests/cron/frontmatter.test.ts
git commit -m "feat(worker): cron frontmatter parser with validation"
```

### Task 6: Implement atomic `rewriteFrontmatter` helper

**Files:**
- Create: `apps/worker/src/cron/rewrite-frontmatter.ts` (also re-exported via worker's index for sharing, OR — preferred — extract to `packages/storage` for true sharing with CLI; decide at impl time. The path below assumes worker-only and a duplicate in CLI lib for now.)
- Create: `apps/worker/tests/cron/rewrite-frontmatter.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rewriteFrontmatter } from "../../src/cron/rewrite-frontmatter.js";

it("atomically flips enabled in CRON.md without touching body bytes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cron-rewrite-"));
  const path = join(dir, "CRON.md");
  const original = `---\nname: Test\nschedule: '0 9 * * *'\nenabled: true\n---\nBody line one.\nBody line two.\n`;
  writeFileSync(path, original);
  await rewriteFrontmatter(path, (data) => ({ ...data, enabled: false }));
  const after = readFileSync(path, "utf-8");
  expect(after).toContain("enabled: false");
  expect(after).toContain("Body line one.");
  expect(after).toContain("Body line two.");
});
```

- [ ] **Step 2: Implement**

```ts
import matter from "gray-matter";
import { promises as fs } from "node:fs";

export async function rewriteFrontmatter(
  path: string,
  patch: (data: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const raw = await fs.readFile(path, "utf-8");
  const parsed = matter(raw);
  const newData = patch(parsed.data as Record<string, unknown>);
  const newBytes = matter.stringify(parsed.content, newData);
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, newBytes, "utf-8");
  await fs.rename(tmp, path);
}
```

- [ ] **Step 3: Run, expect PASS**

Run: `pnpm --filter @zeno/worker test -t "atomically flips enabled"`

- [ ] **Step 4: Commit**

```bash
git add apps/worker/src/cron/rewrite-frontmatter.ts apps/worker/tests/cron/rewrite-frontmatter.test.ts
git commit -m "feat(worker): atomic frontmatter rewrite helper"
```

---

## Phase 4 — `CronManager` (poll loop, reconcile, fire)

### Task 7: Scaffold the manager class + reconcile skeleton

**Files:**
- Create: `apps/worker/src/cron/manager.ts`
- Create: `apps/worker/tests/cron/manager.test.ts`

- [ ] **Step 1: Write failing test for the empty-state reconcile**

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CronManager } from "../../src/cron/manager.js";
import { makeRepos } from "../helpers/makeRepos.js";

it("reconciles an empty folder to zero rows", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cron-mgr-"));
  const repos = makeRepos();
  const mgr = new CronManager({ rootDir: dir, repos, fireRunner: vi.fn() });
  await mgr.reconcileOnce();
  expect(repos.crons.list()).toHaveLength(0);
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement skeleton**

```ts
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { parseCronFile } from "./frontmatter.js";
import { CronExpressionParser } from "cron-parser";

export interface ManagerDeps {
  rootDir: string;                                         // /app/crons inside container
  repos: { crons: CronsRepo; cronRuns: CronRunsRepo };
  fireRunner: (slug: string, body: string) => Promise<{ sessionId: string | null; status: "passed" | "failed"; error?: string }>;
  pollIntervalMs?: number;                                  // default 2000
  logger?: pino.Logger;
}

export class CronManager {
  private isReconciling = false;
  private timeouts = new Map<string, NodeJS.Timeout>();
  private pollTimer: NodeJS.Timeout | null = null;
  constructor(private deps: ManagerDeps) {}

  async start() { await this.reconcileOnce(); this.pollTimer = setInterval(() => this.tick(), this.deps.pollIntervalMs ?? 2000); }
  async stop() { if (this.pollTimer) clearInterval(this.pollTimer); for (const t of this.timeouts.values()) clearTimeout(t); this.timeouts.clear(); }

  async tick() {
    if (this.isReconciling) return;
    this.isReconciling = true;
    try { await this.reconcileOnce(); } finally { this.isReconciling = false; }
  }

  async reconcileOnce() {
    const entries = await this.listFolders();
    const dbRows = new Map(this.deps.repos.crons.list().map((r) => [r.id, r]));
    for (const slug of entries) {
      const path = join(this.deps.rootDir, slug, "CRON.md");
      let stat;
      try { stat = await fs.stat(path); } catch { continue; }
      const dbRow = dbRows.get(slug);
      if (dbRow && dbRow.mtimeMs === stat.mtimeMs) { dbRows.delete(slug); continue; }
      const raw = await fs.readFile(path, "utf-8");
      const hash = createHash("sha256").update(raw).digest("hex");
      if (dbRow && dbRow.contentHash === hash) { dbRows.delete(slug); continue; }
      const parsed = parseCronFile(raw);
      if (parsed.kind === "error") {
        this.deps.repos.crons.markFailed(slug, `${parsed.code}: ${parsed.message}`);
        this.cancelTimeout(slug);
      } else {
        this.deps.repos.crons.upsertFromFile(slug, parsed.value, stat.mtimeMs, hash);
        this.reschedule(slug, parsed.value);
      }
      dbRows.delete(slug);
    }
    // anything still in dbRows is gone from disk
    for (const orphanSlug of dbRows.keys()) {
      this.deps.repos.crons.deleteBySlug(orphanSlug);
      this.cancelTimeout(orphanSlug);
    }
  }

  private async listFolders(): Promise<string[]> {
    const items = await fs.readdir(this.deps.rootDir, { withFileTypes: true }).catch(() => []);
    return items
      .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith(".") && /^[a-z][a-z0-9-]*$/.test(d.name))
      .map((d) => d.name);
  }

  private reschedule(slug: string, parsed: ParsedCron) {
    this.cancelTimeout(slug);
    if (!parsed.enabled) return;
    const next = CronExpressionParser.parse(parsed.schedule).next().getTime();
    const delay = Math.max(0, next - Date.now());
    const t = setTimeout(() => this.fire(slug, parsed.body), delay);
    this.timeouts.set(slug, t);
  }

  private cancelTimeout(slug: string) {
    const t = this.timeouts.get(slug);
    if (t) { clearTimeout(t); this.timeouts.delete(slug); }
  }

  private async fire(slug: string, body: string) {
    const startedAt = new Date().toISOString();
    let outcome;
    try {
      outcome = await this.deps.fireRunner(slug, body);
    } catch (err) {
      outcome = { sessionId: null, status: "failed" as const, error: (err as Error).message };
    }
    const completedAt = new Date().toISOString();
    this.deps.repos.cronRuns.record(slug, { startedAt, completedAt, status: outcome.status, sessionId: outcome.sessionId, error: outcome.error });
    this.deps.repos.crons.touchLastRun(slug, completedAt);
    // reschedule next
    const row = this.deps.repos.crons.get(slug);
    if (row && row.enabled) {
      const next = CronExpressionParser.parse(row.schedule).next().getTime();
      const t = setTimeout(() => this.fire(slug, body), Math.max(0, next - Date.now()));
      this.timeouts.set(slug, t);
    }
  }
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/cron/manager.ts apps/worker/tests/cron/
git commit -m "feat(worker): CronManager skeleton with reconcile loop"
```

### Task 8: Add tests for insert / update / delete / invalid / disabled paths

**Files:**
- Modify: `apps/worker/tests/cron/manager.test.ts`

- [ ] **Step 1: Add tests** (one per reconciliation-matrix row from spec A4):

```ts
it("INSERTs row on new folder with valid CRON.md and schedules timeout", async () => {/* setup tmp dir + CRON.md, call reconcileOnce, assert row + assert timeouts has slug */});
it("UPDATEs row on mtime advance + reschedules", async () => {/* tweak file, advance mtime, reconcile, assert hash + mtime updated */});
it("DELETEs row when folder removed", async () => {/* rm -rf, reconcile, assert empty */});
it("marks row failed on invalid YAML and does not schedule", async () => {/* write garbage, assert lastError + no timeout */});
it("skips files starting with _ or .", async () => {/* _README.md, _template/, .disabled/, assert zero rows */});
it("flips enabled=false → cancels timeout", async () => {/* assert timeouts.has(slug) === false */});
```

- [ ] **Step 2: Run, all green**

Run: `pnpm --filter @zeno/worker test -t "CronManager"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/tests/cron/manager.test.ts
git commit -m "test(worker): CronManager reconciliation matrix coverage"
```

### Task 9: Verify concurrent-reconcile guard

**Files:**
- Modify: `apps/worker/tests/cron/manager.test.ts`

- [ ] **Step 1: Add test**

```ts
it("guards against concurrent reconcile (back-to-back tick fires reconcileOnce once)", async () => {
  const mgr = new CronManager({ rootDir: dir, repos, fireRunner: vi.fn(), pollIntervalMs: 9999 });
  const spy = vi.spyOn(mgr as any, "reconcileOnce");
  await Promise.all([mgr.tick(), mgr.tick()]);
  expect(spy).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run, PASS**

- [ ] **Step 3: Commit**

```bash
git add apps/worker/tests/cron/manager.test.ts
git commit -m "test(worker): CronManager concurrent reconcile guard"
```

---

## Phase 5 — Worker boot wiring

### Task 10: Replace `runner.ts` construction with `CronManager` in `apps/worker/src/index.ts`

**Files:**
- Modify: `apps/worker/src/index.ts` — replace the existing cron runner construction
- Delete: `apps/worker/src/cron/runner.ts`

- [ ] **Step 1: Find the old runner construction**

Run: `grep -n "runner" apps/worker/src/index.ts`
Note the line numbers where the old runner is created and registered.

- [ ] **Step 2: Replace with manager**

Substitute that block with:

```ts
const cronManager = new CronManager({
  rootDir: "/app/crons",
  repos: { crons, cronRuns },
  fireRunner: async (slug, body) => {
    const result = await agent.query({
      prompt: body,
      cwd: `/app/crons/${slug}`,
      systemPrompt: buildCronSystemPrompt({ slug, scheduledAt: new Date().toISOString() }),
    });
    return { sessionId: result.sessionId ?? null, status: result.error ? "failed" : "passed", error: result.error };
  },
  logger: log.child({ scope: "cron-manager" }),
});
await cronManager.start();
process.on("SIGTERM", () => cronManager.stop());
```

- [ ] **Step 3: Delete the runner file**

```bash
rm apps/worker/src/cron/runner.ts
```

- [ ] **Step 4: Update the MCP cron tools wiring**

If `cronMcp = buildCronMcpServer({ crons, cronRuns, runner })` exists, replace `runner` with `manager` and adjust the tool's fire method to call `manager.fire(...)` or remove the tool if the agent no longer needs in-band cron control (spec defers this — confirm at impl time).

- [ ] **Step 5: Run worker tests + smoke**

Run: `pnpm --filter @zeno/worker test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/
git commit -m "feat(worker): wire CronManager into boot, drop legacy runner"
```

---

## Phase 6 — API routes rewrite

### Task 11: Rewrite `apps/api/src/routes/crons.ts`

**Files:**
- Rewrite: `apps/api/src/routes/crons.ts`
- Create: `apps/api/src/lib/cron-test-runner.ts`
- Modify: `apps/api/tests/routes/crons.test.ts`

- [ ] **Step 1: Sketch the new route file**

```ts
import { Hono } from "hono";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { blockIfCli } from "../lib/block-if-cli.js";
import { CronsRepo } from "@zeno/db/runtime/repos/crons.js";
import { parseCronFile } from "@zeno/worker/cron/frontmatter.js"; // OR duplicate in lib if cross-package import undesired
import { runCronTest } from "../lib/cron-test-runner.js";

export function buildCronsRoute(deps: { crons: CronsRepo; cronsRootDir: string }) {
  const app = new Hono();

  app.get("/", (c) => c.json(deps.crons.list()));
  app.get("/next", (c) => c.json(deps.crons.next()));
  app.get("/:slug", (c) => {
    const row = deps.crons.get(c.req.param("slug"));
    return row ? c.json(row) : c.notFound();
  });
  app.get("/:slug/source", async (c) => {
    const slug = c.req.param("slug");
    const path = join(deps.cronsRootDir, slug, "CRON.md");
    const raw = await fs.readFile(path, "utf-8").catch(() => null);
    if (raw === null) return c.notFound();
    const r = parseCronFile(raw);
    if (r.kind === "error") return c.json({ error: r.code, message: r.message }, 422);
    return c.json({ frontmatter: { name: r.value.name, description: r.value.description, schedule: r.value.schedule, enabled: r.value.enabled }, body: r.value.body });
  });

  app.post("/:slug/test", blockIfCli({ action: "test", cliFor: (slug) => `zeno cron test ${slug}` }), async (c) => {
    const slug = c.req.param("slug");
    const result = await runCronTest(slug, deps);
    return c.json(result);
  });

  return app;
}
```

- [ ] **Step 2: Implement `cron-test-runner.ts`**

```ts
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { parseCronFile } from "@zeno/worker/cron/frontmatter.js";

export async function runCronTest(slug: string, deps: { cronsRootDir: string; fireRunner: (slug: string, body: string) => Promise<...> }) {
  const path = join(deps.cronsRootDir, slug, "CRON.md");
  const raw = await fs.readFile(path, "utf-8").catch(() => null);
  if (raw === null) return { status: "failed" as const, sessionId: null, latencyMs: 0, error: "not_found" };
  const parsed = parseCronFile(raw);
  if (parsed.kind === "error") return { status: "failed" as const, sessionId: null, latencyMs: 0, error: `${parsed.code}: ${parsed.message}` };
  const t0 = Date.now();
  const outcome = await deps.fireRunner(slug, parsed.value.body).catch((e) => ({ status: "failed" as const, sessionId: null, error: (e as Error).message }));
  return { ...outcome, latencyMs: Date.now() - t0 };
}
```

- [ ] **Step 3: Update API tests** — gate semantics, response shapes, 404 for removed routes.

(Add tests covering: every removed route returns 404; gate returns 403 with `cli: 'zeno cron test <slug>'`; `/source` returns parsed shape; `/next` no longer carries `notifyConversationId`.)

- [ ] **Step 4: Run API tests**

Run: `pnpm --filter @zeno/api test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/
git commit -m "feat(api): rewrite /api/crons routes (read-only + gated test)"
```

---

## Phase 7 — CLI subtree `zeno cron`

### Task 12: Scaffold parent command + register

**Files:**
- Create: `apps/cli/src/commands/cron.ts`
- Modify: `apps/cli/src/index.ts` — register `cron` subtree
- Create: `apps/cli/src/lib/cron-paths.ts`
- Modify: `apps/cli/src/types/json-output.ts`

- [ ] **Step 1: Add types**

In `apps/cli/src/types/json-output.ts`:

```ts
export interface CronListItem {
  slug: string;
  name: string;
  schedule: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
}

export interface CronShowJson extends CronListItem {
  description: string | null;
  body: string;
}

export interface CronTestJson {
  sessionId: string | null;
  status: "passed" | "failed";
  latencyMs: number;
  error?: string;
}
```

- [ ] **Step 2: Implement `cron-paths.ts`**

```ts
import { join } from "node:path";
import { promises as fs } from "node:fs";
import { profileDir } from "./paths.js";

export function cronsRootDir(profile: string) { return join(profileDir(profile), "crons"); }
export function cronDir(profile: string, slug: string) { return join(cronsRootDir(profile), slug); }
export function cronFile(profile: string, slug: string) { return join(cronDir(profile, slug), "CRON.md"); }
export const slugPattern = /^[a-z][a-z0-9-]*$/;
export function validateSlug(slug: string) {
  if (!slugPattern.test(slug)) throw new Error(`slug must match ${slugPattern}`);
  if (slug.length > 63) throw new Error("slug must be ≤63 chars");
  if (["_template", "_README", ".disabled", ".tmp"].includes(slug)) throw new Error(`slug "${slug}" is reserved`);
}
```

- [ ] **Step 3: Implement parent**

`apps/cli/src/commands/cron.ts`:

```ts
import { defineCommand } from "citty";
import list from "./cron-list.js";
import show from "./cron-show.js";
import create from "./cron-create.js";
import open from "./cron-open.js";
import enable from "./cron-enable.js";
import disable from "./cron-disable.js";
import del from "./cron-delete.js";
import test from "./cron-test.js";

export default defineCommand({
  meta: { name: "cron", description: "manage profile crons (filesystem-as-truth, runs from ~/.zeno/profiles/<name>/crons/)" },
  subCommands: { list, show, create, open, enable, disable, delete: del, test },
});
```

- [ ] **Step 4: Register in `apps/cli/src/index.ts`**

Add to `subCommands`: `cron: () => import("./commands/cron.js").then((m) => m.default)`.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/
git commit -m "feat(cli): scaffold zeno cron parent command + paths helper"
```

### Task 13: `zeno cron list`

Implementation (`apps/cli/src/commands/cron-list.ts`): walk `cronsRootDir(profile)`, filter folders matching slug pattern, read each `CRON.md`, parse via shared frontmatter parser (extracted to `apps/cli/src/lib/cron-frontmatter.ts` mirroring worker's), join with `GET /api/crons` for `lastRunAt`/`nextRunAt`. Render table or `--json` array.

Concrete steps:

- [ ] Write test (`apps/cli/tests/commands/cron-list.test.ts`): given two folders, returns 2-element array; --json emits `CronListItem[]`.
- [ ] Implement using citty defineCommand pattern from `channel-list.ts`.
- [ ] Run test, expect PASS.
- [ ] Commit: `feat(cli): zeno cron list`.

### Task 14: `zeno cron show <slug>`

- [ ] Write test: passes slug → prints frontmatter + body; --json emits CronShowJson; non-TTY no-arg → exit 1.
- [ ] Implement.
- [ ] Run + commit: `feat(cli): zeno cron show`.

### Task 15: `zeno cron create <slug>`

Flags: `--schedule '<expr>'` (required), `--name '<text>'` (default = titleCase(slug)), `--description '<text>'` (optional).

Steps:
- [ ] Write tests:
  - happy path: `--schedule '0 9 * * 1-5'` creates folder + CRON.md with substituted frontmatter, `enabled: true`.
  - invalid slug → exit 1.
  - invalid schedule → exit 1.
  - already exists → exit 1.
- [ ] Implement (read `<repo>/templates/profile/crons/_template/CRON.md` or, simpler, read `<profileDir>/crons/_template/CRON.md` which was scaffolded by profile-create; rewrite frontmatter; write to slug folder).
- [ ] Commit: `feat(cli): zeno cron create`.

### Task 16: `zeno cron open [slug]`

Mirror `apps/cli/src/commands/knowledge-open.ts`. With slug → `cronDir(profile, slug)`; without → `cronsRootDir(profile)`.

- [ ] Write test.
- [ ] Implement.
- [ ] Commit: `feat(cli): zeno cron open`.

### Task 17: `zeno cron enable` + `zeno cron disable`

Both call the same atomic rewriter (CLI lib copy of `rewrite-frontmatter.ts`) with `enabled: true` / `false`.

- [ ] Write tests: idempotent (enable already-enabled is no-op), atomicity (body bytes unchanged).
- [ ] Implement.
- [ ] Commit: `feat(cli): zeno cron enable + disable`.

### Task 18: `zeno cron delete <slug> [--yes]`

- [ ] Write tests: TTY prompt; --yes bypass; non-TTY without --yes exit 1; rm -rf the folder.
- [ ] Implement (use `fs.rm(folder, { recursive: true, force: true })`).
- [ ] Commit: `feat(cli): zeno cron delete`.

### Task 19: `zeno cron test <slug>`

HTTP POST `/api/crons/:slug/test` with `X-Zeno-Origin: cli`; await JSON; print `slug · status · session <id> · <ms>` or surface the error.

- [ ] Write test (mock API).
- [ ] Implement.
- [ ] Commit: `feat(cli): zeno cron test`.

### Task 20: Integration test — all eight verbs end-to-end against a fake API + tmp profile

- [ ] Write test exercising every verb in sequence (create → enable → disable → test → delete).
- [ ] Run; PASS.
- [ ] Commit: `test(cli): cron subtree integration`.

---

## Phase 8 — Dashboard `/crons` read-only rewrite

### Task 21: Drop mutation hooks + dead lib modules

**Files:**
- Modify: `apps/dashboard/src/lib/use-crons.ts` — remove `useCreateCron`, `usePauseCron`, `useResumeCron`, `useRunNowCron`, `useDeleteCron`, `useUpdateCron` (whatever currently exists).
- Modify: `apps/dashboard/src/lib/use-cron.ts` — same.
- Modify: `apps/dashboard/src/lib/use-next-crons.ts` — drop `notifyConversationId` from `NextCron` type.
- Delete: `apps/dashboard/src/lib/use-cron-skills.ts`, `use-cron-connectors.ts`, `cron-schedule.ts`.

- [ ] Find every consumer of the deleted hooks: `grep -rn "useDeleteCron\|usePauseCron\|useResumeCron\|useRunNowCron\|useCreateCron\|useUpdateCron" apps/dashboard/src/`.
- [ ] Each consumer is either a component being deleted (Task 22) or a route being rewritten (Task 23). No survivors.
- [ ] Run `pnpm --filter @zeno/dashboard typecheck`. Fix any orphan reference revealed.
- [ ] Commit: `refactor(dashboard): drop cron mutation hooks (CLI-first)`.

### Task 22: Delete obsolete components

```bash
rm apps/dashboard/src/components/modals/new-cron-modal.tsx
rm apps/dashboard/src/components/modals/delete-cron-modal.tsx
rm apps/dashboard/src/components/crons/cron-form.tsx
rm apps/dashboard/src/components/crons/cron-row-actions.tsx
rm apps/dashboard/src/components/crons/schedule-picker.tsx
rm apps/dashboard/src/components/crons/link-skill-picker-modal.tsx
rm apps/dashboard/src/components/crons/link-connector-picker-modal.tsx
rm apps/dashboard/src/components/crons/linked-skills-section.tsx
rm apps/dashboard/src/components/crons/linked-connectors-section.tsx
```

- [ ] Run typecheck; fix imports.
- [ ] Commit: `refactor(dashboard): remove cron mutation UI surfaces`.

### Task 23: Rewrite `crons.index.tsx` and `crons.$id.tsx` for read-only flow

- [ ] Index reads `GET /api/crons` + `GET /api/mode`; renders table; chips → `<CommandModal>` per spec A7.
- [ ] Detail reads `GET /api/crons/:slug` + `GET /api/crons/:slug/source`; renders Properties block + body markdown + run history.
- [ ] Refactor `cron-actions.tsx` to render `<CommandModal>` triggers.
- [ ] Update `cron-run-history-row.tsx` to render `session_id`.
- [ ] Run tests + visual smoke.
- [ ] Commit: `feat(dashboard): rewrite /crons as read-only with CommandModal`.

### Task 24: Drop `notifyConversationId` from home page widget types

- [ ] In `apps/dashboard/src/routes/_authed/index.tsx`, locate the `NextCronModel` interface (line ~202) and remove `notifyConversationId`.
- [ ] In `apps/dashboard/src/lib/use-next-crons.ts` line 9, remove the corresponding field from `NextCron`.
- [ ] Run typecheck.
- [ ] Commit: `refactor(dashboard): drop notifyConversationId from next-cron widget types`.

---

## Phase 9 — apps/docs rewrite

### Task 25: Rewrite `apps/docs/content/docs/crons.mdx`

- [ ] Replace the page content per spec A8.
- [ ] Verify build: `pnpm --filter @zeno/docs build`.
- [ ] Commit: `docs(crons): rewrite concept page for filesystem-as-truth flow`.

### Task 26: Add `Crons` section to `apps/docs/content/docs/cli.mdx`

- [ ] Add the new `## Crons` heading + one subsection per verb; import flag tables from `@/generated/cli-flags/cron-*.mdx`.
- [ ] Run the docs E2E rehearsal (verify every documented command works against a fresh profile).
- [ ] Commit: `docs(cli): document zeno cron subtree`.

---

## Phase 10 — Infra: container mount

### Task 27: Bind-mount the host crons/ into the worker container

**Files:**
- Modify: `infra/Dockerfile` — declare `/app/crons` as a mount point (no copy at build).
- Modify: `apps/cli/src/commands/start.ts` — add the bind `<profileDir>/crons:/app/crons:ro` to the docker run config.

- [ ] Find existing bind logic (knowledge mount is the pattern): `grep -n "knowledge" apps/cli/src/commands/start.ts`.
- [ ] Add the crons bind alongside knowledge.
- [ ] Smoke: `zeno start <test-profile>`; `docker exec <container> ls /app/crons` → shows `_README.md`, `_template/`.
- [ ] Commit: `feat(infra): bind-mount per-profile crons/ read-only into worker`.

---

## Phase 11 — Manual E2E rehearsal

### Task 28: End-to-end on a fresh profile

- [ ] `pnpm run quality-gate` green.
- [ ] `zeno profile create cron-e2e` (verify `crons/_README.md` + `crons/_template/CRON.md` present).
- [ ] `zeno start cron-e2e --build`; tail logs.
- [ ] `zeno cron create hello-world --schedule '*/1 * * * *' --name "Hello world"`; edit the file to a real prompt.
- [ ] Within 2 s, dashboard `/crons` shows the new entry.
- [ ] `zeno cron test hello-world` returns `passed · session <id>`.
- [ ] Within 1 min the cron fires automatically; `cron_runs` row appears.
- [ ] `zeno cron disable hello-world`; verify the next minute does not fire.
- [ ] `zeno cron enable hello-world`; fires next minute.
- [ ] `zeno cron delete hello-world --yes`; row gone in ≤ 4 s.
- [ ] Stop + delete profile.

If any step fails, fix in-place and re-commit; document the bug + fix in the PR body.

---

## Phase 12 — Quality gate + PR

### Task 29: Final quality gate

- [ ] `pnpm run quality-gate` — green.
- [ ] `git status` — clean (no stray files).
- [ ] Verify the spec, plan, tasks files are all on the branch.

### Task 30: Open the PR

- [ ] Invoke `/new-pr` skill (project convention; do not run `gh pr create` directly).
- [ ] PR title: `feat(crons): CLI-first crons with filesystem source of truth`.
- [ ] Closes: `#58`.
- [ ] Labels: `enhancement`, `roadmap` (since #58 is roadmap-tracked).
- [ ] Test plan: paste the Phase 11 checklist plus the spec's Acceptance Criteria sections.
- [ ] Sanitization checkbox: confirm no real identifiers in the diff.
- [ ] Move `Crons CLI-first` entry from `Now` / `Next` in `ROADMAP.md` to `Recently shipped`.
