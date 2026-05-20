---
feature: agents-md-per-instance
plan: "[[plan-agents-md-per-instance]]"
spec: "[[spec-agents-md-per-instance]]"
created: 2026-05-20
---
# AGENTS.md Per-Instance Operating Manual — Tasks

**For this plan:** [[plan-agents-md-per-instance]]

Branch: `feat/agents-md-per-instance` (already created from `main`).

Conventional Commits: each task ends with one commit. Use `refactor(scope): ...` for renames and `docs(scope): ...` for documentation-only changes. NEVER use `--no-verify` or skip hooks.

---

## Phase 1 — Worker runtime

### Task 1: Refactor `buildSystemPrompt` to load AGENTS.md and drop the user-framing

**Files:**
- Modify: `apps/worker/src/agent/system-prompt.ts`
- Modify: `apps/worker/tests/agent/system-prompt.test.ts` (create if missing)

- [ ] **Step 1: Write/update the failing tests first**

If `apps/worker/tests/agent/system-prompt.test.ts` does not exist, create it. If it does, replace its content with:

```ts
import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '@/agent/system-prompt';

describe('buildSystemPrompt', () => {
  it('concatenates SOUL and AGENTS with a blank line and no "About the user" heading', () => {
    const out = buildSystemPrompt('You are Zeno.', '# Agent Operating Manual\n\nRule 1.');
    expect(out).toBe('You are Zeno.\n\n# Agent Operating Manual\n\nRule 1.');
    expect(out).not.toContain('# About the user');
  });

  it('falls back to a minimal default when SOUL.md is missing', () => {
    const out = buildSystemPrompt(null, '# Agent Operating Manual\n\nRule 1.');
    expect(out).toContain('You are Zeno');
    expect(out).toContain('# Agent Operating Manual');
  });

  it('emits a generic note when AGENTS.md is missing', () => {
    const out = buildSystemPrompt('You are Zeno.', null);
    expect(out).toContain('AGENTS.md not found');
    expect(out).not.toContain('USER.md');
    expect(out).not.toContain('About the user');
  });

  it('handles both files missing without throwing', () => {
    const out = buildSystemPrompt(null, null);
    expect(out).toContain('You are Zeno');
    expect(out).toContain('AGENTS.md not found');
  });

  it('trims surrounding whitespace from both files', () => {
    const out = buildSystemPrompt('  You are Zeno.  \n\n', '\n\n# Manual\n\n');
    expect(out).toBe('You are Zeno.\n\n# Manual');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
pnpm --filter @zeno/worker test -- tests/agent/system-prompt.test.ts
```

Expected: FAIL. The current signature accepts `userMdContent` (not `agentsMdContent`), but tests call `buildSystemPrompt(soul, agents)` — assertions about the `# About the user` heading and `AGENTS.md not found` text will fail against the current implementation.

- [ ] **Step 3: Rewrite `system-prompt.ts`**

Replace the entire body of `apps/worker/src/agent/system-prompt.ts` with:

```ts
import { readFileSync } from 'node:fs';
import { createLogger } from '@zeno/logger';

const logger = createLogger({ service: 'worker' });

const AGENT_CANDIDATES = ['/app/agent', 'agent'];
const PROFILE_CANDIDATES = ['/app/profile', 'profile'];

const DEFAULT_SOUL =
  'You are Zeno, a personal agent. Respond helpfully and concisely in the language the user addresses you in.';

const NO_AGENTS_NOTE =
  '_AGENTS.md not found — this Zeno instance has no operating manual. Operator should write `~/.zeno/profiles/<profile>/AGENTS.md` to configure per-instance rules._';

function loadFromCandidates(candidates: string[], filename: string): string | null {
  for (const base of candidates) {
    try {
      const content = readFileSync(`${base}/${filename}`, 'utf8').trim();
      if (content.length > 0) return content;
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * Load a file from the agent/ directory (Zeno's shared baseline identity: SOUL.md, etc).
 * Returns null if not found in any candidate.
 */
export function loadAgentFile(filename: string): string | null {
  return loadFromCandidates(AGENT_CANDIDATES, filename);
}

/**
 * Load a file from the profile/ directory (per-instance operating manual: AGENTS.md, etc).
 * Returns null if not found in any candidate.
 */
export function loadProfileFile(filename: string): string | null {
  return loadFromCandidates(PROFILE_CANDIDATES, filename);
}

/**
 * Build the full system prompt from SOUL.md (shared baseline identity) +
 * AGENTS.md (per-instance operating manual). SOUL comes from `agent/`,
 * AGENTS from `profile/`. Pass null when files are missing — sensible
 * defaults are used.
 *
 * Spec 2026-05-20 (agents-md-per-instance): replaced the per-profile
 * USER.md (single-owner framing) with AGENTS.md (per-instance operating
 * manual). The reframe reflects reality — a Zeno instance has one
 * operator (OAuth-token owner) and N audiences (people on the channel) —
 * and removes the misleading `# About the user` heading from the
 * cached system prompt.
 *
 * Spec 0052 invariant: the call site (`apps/worker/src/agent/backends/claude-code.ts`)
 * MUST wrap this return value in the preset option shape
 * `{ type: 'preset', preset: 'claude_code', append: ... }`. A bare-string
 * systemPrompt silently drops the SDK's skill listing.
 */
export function buildSystemPrompt(
  soulMdContent: string | null,
  agentsMdContent: string | null,
): string {
  const soul =
    soulMdContent && soulMdContent.trim().length > 0 ? soulMdContent.trim() : DEFAULT_SOUL;

  if (!soulMdContent) {
    logger.warn({ event: 'soul_md_missing' }, 'SOUL.md not found — using minimal default prompt');
  }

  const agents =
    agentsMdContent && agentsMdContent.trim().length > 0
      ? agentsMdContent.trim()
      : NO_AGENTS_NOTE;

  return `${soul}\n\n${agents}`;
}
```

- [ ] **Step 4: Run tests, expect pass**

Run:
```bash
pnpm --filter @zeno/worker test -- tests/agent/system-prompt.test.ts
```

Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/agent/system-prompt.ts apps/worker/tests/agent/system-prompt.test.ts
git commit -m "refactor(worker): swap USER.md for AGENTS.md in buildSystemPrompt

Replace userMdContent parameter with agentsMdContent. Drop the
misleading '# About the user' heading. Drop NO_USER_NOTE fallback.
Add unit-test coverage for both-present, SOUL-missing, AGENTS-missing,
both-missing, and trim cases.

Refs #86"
```

---

### Task 2: Update worker `index.ts` call sites + log events

**Files:**
- Modify: `apps/worker/src/index.ts`

- [ ] **Step 1: Confirm the current shape**

Run:
```bash
grep -n "USER\.md\|user_md_\|loadProfileFile('USER" apps/worker/src/index.ts
```

Expected hits around lines 182-187, 192, 311-317.

- [ ] **Step 2: Apply the rename**

In `apps/worker/src/index.ts`:

1. Around line 182 — replace the block:
```ts
  // Load identity files (SOUL.md from agent/, USER.md from profile/).
  // Spec 0050: skills are no longer part of the runtime; the system prompt
  // is just SOUL + USER.
  const buildPromptNow = (): string => {
    const soul = loadAgentFile('SOUL.md');
    const user = loadProfileFile('USER.md');
    return buildSystemPrompt(soul, user);
  };

  const initialSoul = loadAgentFile('SOUL.md');
  const initialUser = loadProfileFile('USER.md');

  const promptHolder = { value: buildSystemPrompt(initialSoul, initialUser) };
```

with:
```ts
  // Load identity files (SOUL.md from agent/, AGENTS.md from profile/).
  // Spec 2026-05-20 (agents-md-per-instance): the per-profile operating
  // manual lives at /app/profile/AGENTS.md. Shared baseline (SOUL.md)
  // stays at /app/agent/SOUL.md.
  const buildPromptNow = (): string => {
    const soul = loadAgentFile('SOUL.md');
    const agents = loadProfileFile('AGENTS.md');
    return buildSystemPrompt(soul, agents);
  };

  const initialSoul = loadAgentFile('SOUL.md');
  const initialAgents = loadProfileFile('AGENTS.md');

  const promptHolder = { value: buildSystemPrompt(initialSoul, initialAgents) };
```

2. Around line 309-317 — replace the log block:
```ts
  if (initialSoul) {
    logger.info({ event: 'soul_md_loaded', bytes: initialSoul.length }, 'SOUL.md loaded');
  }
  if (initialUser) {
    logger.info({ event: 'user_md_loaded', bytes: initialUser.length }, 'USER.md loaded');
  } else {
    logger.warn(
      { event: 'user_md_missing' },
      'USER.md not found — Zeno will run without user-specific context',
    );
  }
```

with:
```ts
  if (initialSoul) {
    logger.info({ event: 'soul_md_loaded', bytes: initialSoul.length }, 'SOUL.md loaded');
  }
  if (initialAgents) {
    logger.info(
      { event: 'agents_md_loaded', bytes: initialAgents.length },
      'AGENTS.md loaded',
    );
  } else {
    logger.warn(
      { event: 'agents_md_missing' },
      'AGENTS.md not found — Zeno will run without per-instance operating manual',
    );
  }
```

- [ ] **Step 3: Verify no surviving references in index.ts**

Run:
```bash
grep -n "USER\.md\|user_md_\|userMd\|initialUser" apps/worker/src/index.ts
```

Expected: empty.

- [ ] **Step 4: Run worker tests**

Run:
```bash
pnpm --filter @zeno/worker test
```

Expected: PASS (all worker tests, including the system-prompt tests added in Task 1).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/index.ts
git commit -m "refactor(worker): rename USER.md call sites to AGENTS.md

Update buildPromptNow + log events (user_md_loaded → agents_md_loaded,
user_md_missing → agents_md_missing). Inline comment references the
new spec.

Refs #86"
```

---

### Task 3: Update the profile watcher to watch AGENTS.md

**Files:**
- Modify: `apps/worker/src/profile/watcher.ts`
- Modify: `apps/worker/tests/profile/watcher.test.ts`

- [ ] **Step 1: Inspect the current classify**

Read `apps/worker/src/profile/watcher.ts:179-188`. The `classify` function returns `'prompt'` for `source === 'profile' && filename === 'USER.md'`.

- [ ] **Step 2: Swap the literal**

In `apps/worker/src/profile/watcher.ts`, replace:
```ts
  if (source === 'profile' && normalized === 'USER.md') return 'prompt';
```
with:
```ts
  if (source === 'profile' && normalized === 'AGENTS.md') return 'prompt';
```

- [ ] **Step 3: Update the watcher test**

In `apps/worker/tests/profile/watcher.test.ts`, find every fixture/assertion using `'USER.md'` and replace with `'AGENTS.md'`. Find the JSDoc comment (if any) and update.

Run:
```bash
grep -n "USER\.md" apps/worker/tests/profile/watcher.test.ts
```

For each hit, replace `'USER.md'` → `'AGENTS.md'` (preserving the quotes and surrounding code).

- [ ] **Step 4: Run watcher tests**

Run:
```bash
pnpm --filter @zeno/worker test -- tests/profile/watcher.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/profile/watcher.ts apps/worker/tests/profile/watcher.test.ts
git commit -m "refactor(worker): watch AGENTS.md instead of USER.md in profile watcher

Refs #86"
```

---

## Phase 2 — API

### Task 4: Update `apps/api/src/routes/settings.ts` constants + comments

**Files:**
- Modify: `apps/api/src/routes/settings.ts`

- [ ] **Step 1: Locate the constants**

Run:
```bash
grep -n "TRACKED_FILES\|WRITABLE_FILES\|USER\.md" apps/api/src/routes/settings.ts
```

Hits at lines 8, 32, 55, 58, 60, 79, 102.

- [ ] **Step 2: Update both constants**

Replace:
```ts
const TRACKED_FILES = ['SOUL.md', 'USER.md', 'crons.yaml'] as const;
```
with:
```ts
const TRACKED_FILES = ['SOUL.md', 'AGENTS.md', 'crons.yaml'] as const;
```

Replace:
```ts
// Spec 0067 B: hardcoded allowlist of profile files writable via the
// API. Only USER.md flips writable in this spec — SOUL.md is committed
// identity, crons.yaml is legacy (manage via /crons), mcp.json is gone
// (post-spec-0032 it's DB-managed). Anything not in this set returns 403.
const WRITABLE_FILES = new Set(['USER.md']);

// Spec 0067 B: hard cap on PUT body. USER.md is structural metadata,
// not free-form content — 32 kB is generous (typical USER.md is 1–2 kB).
const MAX_PROFILE_FILE_BYTES = 32_768;
```
with:
```ts
// Spec 2026-05-20 (agents-md-per-instance): per-profile operating
// manual is AGENTS.md. SOUL.md is shared baseline identity (committed
// in agent/, read-only). crons.yaml is legacy (manage via /crons).
// Anything not in this set returns 403.
const WRITABLE_FILES = new Set(['AGENTS.md']);

// Hard cap on PUT body. AGENTS.md is structural metadata, not free-form
// content — 32 kB is generous (typical AGENTS.md is 1–2 kB).
const MAX_PROFILE_FILE_BYTES = 32_768;
```

- [ ] **Step 3: Update the inline JSDoc on the GET route**

Around line 79, replace:
```ts
   * Same allowlist as PUT — only USER.md is exposed today. Returns
   * 404 when the file is missing (the dashboard renders an empty
   * textarea seeded with default frontmatter in that case).
```
with:
```ts
   * Same allowlist as PUT — only AGENTS.md is exposed today. Returns
   * 404 when the file is missing (the dashboard renders an empty
   * textarea in that case).
```

Around line 101, replace:
```ts
   * user-supplied bytes. The hardcoded WRITABLE_FILES allowlist
   * rejects anything other than USER.md (returning 403). A path
   * containing '/' or '..' won't reach this handler at all because
```
with:
```ts
   * user-supplied bytes. The hardcoded WRITABLE_FILES allowlist
   * rejects anything other than AGENTS.md (returning 403). A path
   * containing '/' or '..' won't reach this handler at all because
```

- [ ] **Step 4: Verify no surviving USER.md refs in settings.ts**

Run:
```bash
grep -n "USER\.md" apps/api/src/routes/settings.ts
```

Expected: empty.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/settings.ts
git commit -m "refactor(api): swap USER.md for AGENTS.md in TRACKED_FILES and WRITABLE_FILES

Refs #86"
```

---

### Task 5: Rename `parse-user-md.ts` → `parse-agents-md.ts` + update imports

**Files:**
- Delete: `apps/api/src/lib/parse-user-md.ts`
- Create: `apps/api/src/lib/parse-agents-md.ts`
- Modify: every importer of the parser (find via grep)

> **Note on semantics:** `parseUserMdName` reads a `name:` field from YAML frontmatter or markdown body. The new AGENTS.md template has no `name:` field, so the parser will return `null` in practice on greenfield profiles. The rename preserves behavior — operators who add a `name:` line to their AGENTS.md (off-template) keep getting a display name in the dashboard. No call-site logic changes.

- [ ] **Step 1: Locate all importers**

Run:
```bash
grep -rn "parseUserMdName\|parse-user-md" apps/ packages/
```

Expected hits: the source file itself + `apps/api/src/routes/settings.ts` (around line 51).

- [ ] **Step 2: Create the renamed file**

Create `apps/api/src/lib/parse-agents-md.ts`:

```ts
/**
 * Parse the operator name from AGENTS.md (if present).
 *
 * AGENTS.md is an operating manual, not a user bio, so a `name:` field
 * is optional. Operators who want their name surfaced in the dashboard
 * can add YAML frontmatter or a `Name: <value>` line; everyone else
 * gets null and the dashboard falls back to the profile slug.
 *
 * Two acceptable formats:
 *
 * 1. YAML frontmatter:
 *    ---
 *    name: Alex
 *    ---
 *
 * 2. Markdown body anywhere in the file:
 *    `Name: Alex` or `**Name:** Alex` (case-insensitive).
 *
 * Returns null when neither format matches.
 */
export function parseAgentsMdName(content: string): string | null {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  const frontmatterBody = fm?.[1];
  if (frontmatterBody) {
    const nameMatch = frontmatterBody.match(/^name:\s*(.+?)\s*$/m);
    const fmName = nameMatch?.[1]?.trim();
    if (fmName) return fmName;
  }

  const bodyMatch = content.match(/^[\s>\-*]*\**\s*name\s*\**\s*:\s*(.+?)\s*$/im);
  const bodyName = bodyMatch?.[1]
    ?.trim()
    ?.replace(/^[*_`\s]+|[*_`\s]+$/g, '')
    ?.trim();
  if (bodyName) return bodyName;

  return null;
}
```

- [ ] **Step 3: Delete the old file**

```bash
git rm apps/api/src/lib/parse-user-md.ts
```

- [ ] **Step 4: Update every importer**

For each hit from Step 1 (excluding the deleted file), replace:
- import path: `./parse-user-md` (or whatever the relative path is) → `./parse-agents-md`
- symbol: `parseUserMdName` → `parseAgentsMdName`
- the local variable name (e.g., `userMdPath`) in the readProfileInfo function: `userMdPath` → `agentsMdPath`
- the literal filename used to build the path: `'USER.md'` → `'AGENTS.md'`

Concretely in `apps/api/src/routes/settings.ts` around lines 47-52:

Replace:
```ts
function readProfileInfo(profileDir: string): { name: string | null; slug: string } {
  const slug = profileDir.split('/').filter(Boolean).pop() ?? 'unknown';
  const userMdPath = join(profileDir, 'USER.md');
  if (!existsSync(userMdPath)) return { name: null, slug };
  const content = readFileSync(userMdPath, 'utf8');
  return { name: parseUserMdName(content), slug };
}
```
with:
```ts
function readProfileInfo(profileDir: string): { name: string | null; slug: string } {
  const slug = profileDir.split('/').filter(Boolean).pop() ?? 'unknown';
  const agentsMdPath = join(profileDir, 'AGENTS.md');
  if (!existsSync(agentsMdPath)) return { name: null, slug };
  const content = readFileSync(agentsMdPath, 'utf8');
  return { name: parseAgentsMdName(content), slug };
}
```

And update the top-of-file import:
```ts
import { parseUserMdName } from '@/lib/parse-user-md';
```
→
```ts
import { parseAgentsMdName } from '@/lib/parse-agents-md';
```

- [ ] **Step 5: Verify no orphan refs**

Run:
```bash
grep -rn "parseUserMdName\|parse-user-md\|userMdPath" apps/ packages/
```

Expected: empty.

- [ ] **Step 6: Run API tests**

Run:
```bash
pnpm --filter @zeno/api test
```

Some tests in `apps/api/tests/routes/settings.test.ts` reference `USER.md` — they will fail here. That's expected; Task 6 fixes them.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/parse-agents-md.ts apps/api/src/routes/settings.ts
git commit -m "refactor(api): rename parse-user-md → parse-agents-md

Function renamed to parseAgentsMdName. readProfileInfo now reads
AGENTS.md and uses parseAgentsMdName. No behavior change — the parser
still extracts an optional 'name:' field from frontmatter or body.

Refs #86"
```

---

### Task 6: Update API tests + remaining string refs

**Files:**
- Modify: `apps/api/tests/routes/settings.test.ts`
- Modify: `apps/api/src/lib/read-session-jsonl.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Find every remaining USER.md ref in the API**

Run:
```bash
grep -rn "USER\.md\|user_md\|user-md\|UserMd" apps/api/
```

- [ ] **Step 2: Edit each hit**

For each hit, replace `USER.md` → `AGENTS.md` and `user_md` → `agents_md` and `UserMd` → `AgentsMd` (case-preserving). Test fixtures that write a file named `USER.md` should write `AGENTS.md` instead. Tests that PUT to `/api/settings/profile-files/USER.md` should target `AGENTS.md` for the success path. Add a new test case asserting that PUT to `/api/settings/profile-files/USER.md` returns 403.

In `apps/api/src/server.ts`, the JSDoc on the export `buildServer` mentions `USER.md` — replace with `AGENTS.md`.

In `apps/api/src/lib/read-session-jsonl.ts`, find the `USER.md` reference (likely a comment) and replace.

- [ ] **Step 3: Run API tests**

Run:
```bash
pnpm --filter @zeno/api test
```

Expected: PASS.

- [ ] **Step 4: Verify zero USER.md refs in apps/api/**

```bash
grep -rn "USER\.md\|user_md\|user-md\|UserMd" apps/api/
```

Expected: empty.

- [ ] **Step 5: Commit**

```bash
git add apps/api/
git commit -m "refactor(api): finish USER → AGENTS rename across tests + comments

Refs #86"
```

---

## Phase 3 — CLI

### Task 7: Rewrite `apps/cli/src/lib/templates.ts`

**Files:**
- Modify: `apps/cli/src/lib/templates.ts`
- Modify: `apps/cli/tests/lib/templates.test.ts` (if exists; create assertions if absent)

- [ ] **Step 1: Replace the module**

Replace the entire body of `apps/cli/src/lib/templates.ts` with:

```ts
// Read templates/profile/* and write a freshly-created profile dir
// under ~/.zeno/profiles/<name>/.
//
// Spec 2026-05-20 (agents-md-per-instance): the per-profile manual is
// AGENTS.md, written verbatim from templates/profile/AGENTS.md. No
// placeholder substitution — the template is static; the operator
// fills in their own rules.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { profileDir, templatesProfileDir } from './paths.js';

export function readAgentsTemplate(): string {
  return readFileSync(join(templatesProfileDir(), 'AGENTS.md'), 'utf8');
}

export function readEnvTemplate(): string {
  return readFileSync(join(templatesProfileDir(), 'env.template'), 'utf8');
}

export function renderEnv(opts: { masterKey: string }): string {
  return readEnvTemplate().replace(/<generated>/g, opts.masterKey);
}

/**
 * Materialize a fresh profile directory at ~/.zeno/profiles/<profile>/ with
 * AGENTS.md and .env written from the canonical templates.
 */
export function materializeProfile(opts: {
  profile: string;
  masterKey: string;
}): void {
  const dir = profileDir(opts.profile);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'AGENTS.md'), readAgentsTemplate(), 'utf8');
  writeFileSync(join(dir, '.env'), renderEnv({ masterKey: opts.masterKey }), 'utf8');
}
```

(`detectTimezone` is removed — the template no longer references the timezone. If `detectTimezone` is imported elsewhere, leave it in place for now; otherwise Task 8 strips its caller in `profile-create.ts`.)

- [ ] **Step 2: Find every importer**

```bash
grep -rn "readUserTemplate\|renderUserMd\|detectTimezone\|materializeProfile" apps/ packages/
```

Each importer needs an update — proceed to Task 8 for the main caller.

- [ ] **Step 3: Run CLI tests**

```bash
pnpm --filter @zeno/cli test
```

Expected: FAIL or compile errors at the CLI command site (Task 8 fixes those).

- [ ] **Step 4: Commit (template loader only)**

```bash
git add apps/cli/src/lib/templates.ts
git commit -m "refactor(cli): swap USER.md template loader for AGENTS.md

Drops <your-name> + <auto-detected-tz> placeholder substitution
(template is now static). materializeProfile writes AGENTS.md.

Refs #86"
```

---

### Task 8: Update `apps/cli/src/commands/profile-create.ts`

**Files:**
- Modify: `apps/cli/src/commands/profile-create.ts`

- [ ] **Step 1: Find every USER.md ref**

```bash
grep -n "USER\.md\|ownerName\|user-md\|userMd\|detectTimezone\|renderUserMd" apps/cli/src/commands/profile-create.ts
```

- [ ] **Step 2: Apply edits**

For each hit:

1. Replace any flag description string mentioning `USER.md` with the equivalent string referencing `AGENTS.md`. Example: `'how Zeno calls you (goes to USER.md). Prompted if omitted.'` → either drop the `--owner` flag entirely (preferred — template is static and has no name placeholder) OR change the description to `'(unused) — kept for compatibility with older profile-create scripts'` and stop wiring it to template substitution.
2. Remove the `ownerName` / `timezone` arguments from the `materializeProfile` call (the new signature takes only `profile` + `masterKey`).
3. Replace display strings:
```ts
    console.log(`  USER.md:     ${c.gray(`~/.zeno/profiles/${name}/USER.md`)}`);
    ...
    console.log(`  ${c.gray('Edit:')}  $EDITOR ~/.zeno/profiles/${name}/USER.md`);
```
with:
```ts
    console.log(`  AGENTS.md:   ${c.gray(`~/.zeno/profiles/${name}/AGENTS.md`)}`);
    ...
    console.log(`  ${c.gray('Edit:')}  $EDITOR ~/.zeno/profiles/${name}/AGENTS.md`);
```

4. Drop any prompt that asks for the operator's name if the only consumer was `renderUserMd`. If the prompt has other consumers (e.g., env file), leave it but stop passing the value to `materializeProfile`.

- [ ] **Step 3: Compile + test**

```bash
pnpm --filter @zeno/cli test
```

Expected: PASS.

- [ ] **Step 4: Verify**

```bash
grep -n "USER\.md\|ownerName\|renderUserMd" apps/cli/src/commands/profile-create.ts
```

Expected: empty.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/commands/profile-create.ts
git commit -m "refactor(cli): profile-create writes AGENTS.md, not USER.md

Drop --owner placeholder substitution path. Display + prompt copy
references AGENTS.md.

Refs #86"
```

---

### Task 9: Update `profile-show.ts` + `paths.ts`

**Files:**
- Modify: `apps/cli/src/commands/profile-show.ts`
- Modify: `apps/cli/src/lib/paths.ts`

- [ ] **Step 1: Find USER.md refs in both files**

```bash
grep -n "USER\.md\|user-md\|userMd" apps/cli/src/commands/profile-show.ts apps/cli/src/lib/paths.ts
```

In `profile-show.ts` around line 85:
```ts
    console.log(`    /app/profile   ${c.gray(`← ~/.zeno/profiles/${name}`)}`);
```
(No direct USER.md ref in that line — but the next/prior line in the mount-listing may list files.) Look for any line printing the literal `USER.md` and replace with `AGENTS.md`.

- [ ] **Step 2: Apply edits**

Replace each `USER.md` → `AGENTS.md`. If `paths.ts` exports a `userMdPath()` helper, rename to `agentsMdPath()` and update its return value.

- [ ] **Step 3: Verify**

```bash
grep -n "USER\.md\|userMd" apps/cli/src/commands/profile-show.ts apps/cli/src/lib/paths.ts
```

Expected: empty.

- [ ] **Step 4: Commit**

```bash
git add apps/cli/src/commands/profile-show.ts apps/cli/src/lib/paths.ts
git commit -m "refactor(cli): rename USER.md references in profile-show + paths

Refs #86"
```

---

## Phase 4 — Dashboard

### Task 10: Rename hook `use-user-md.ts` → `use-agents-md.ts`

**Files:**
- Delete: `apps/dashboard/src/lib/use-user-md.ts`
- Create: `apps/dashboard/src/lib/use-agents-md.ts`
- Modify: every importer

- [ ] **Step 1: Read the current hook**

```bash
cat apps/dashboard/src/lib/use-user-md.ts
```

Note the hook name, return shape, and endpoint URL.

- [ ] **Step 2: Create the renamed file with all USER → AGENTS substitutions**

Copy the existing file to `apps/dashboard/src/lib/use-agents-md.ts`, then:
- `useUserMd` → `useAgentsMd`
- `USER.md` → `AGENTS.md` (both in URLs and in any user-visible strings)
- `userMd` → `agentsMd`
- update JSDoc references

- [ ] **Step 3: Delete the old file**

```bash
git rm apps/dashboard/src/lib/use-user-md.ts
```

- [ ] **Step 4: Update importers**

```bash
grep -rn "use-user-md\|useUserMd" apps/dashboard/src/
```

Each hit: import path → `./use-agents-md` (or relative equivalent); symbol → `useAgentsMd`.

- [ ] **Step 5: Verify**

```bash
grep -rn "use-user-md\|useUserMd" apps/dashboard/src/
```

Expected: empty.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/lib/use-agents-md.ts apps/dashboard/
git commit -m "refactor(dashboard): rename useUserMd → useAgentsMd hook

Refs #86"
```

---

### Task 11: Rename component `user-md-editor.tsx` → `agents-md-editor.tsx`

**Files:**
- Delete: `apps/dashboard/src/components/settings/user-md-editor.tsx`
- Create: `apps/dashboard/src/components/settings/agents-md-editor.tsx`
- Modify: every importer

- [ ] **Step 1: Read the current component**

```bash
cat apps/dashboard/src/components/settings/user-md-editor.tsx
```

- [ ] **Step 2: Create the renamed file with substitutions**

Copy the file to `apps/dashboard/src/components/settings/agents-md-editor.tsx`, then:
- Component name `UserMdEditor` → `AgentsMdEditor`
- Imported hook: `useUserMd` → `useAgentsMd` (and its import path)
- Any visible label "User profile" / "User.md" → "Operating manual" / "AGENTS.md" (final copy at implementer's discretion; the only hard rule is no surviving `USER.md` or "user profile" / "user bio" wording in user-visible strings)
- JSDoc updated

- [ ] **Step 3: Delete the old file**

```bash
git rm apps/dashboard/src/components/settings/user-md-editor.tsx
```

- [ ] **Step 4: Update importers**

```bash
grep -rn "user-md-editor\|UserMdEditor" apps/dashboard/src/
```

Each hit: import path → `./agents-md-editor`; symbol → `AgentsMdEditor`.

- [ ] **Step 5: Verify**

```bash
grep -rn "user-md-editor\|UserMdEditor\|user profile\|user bio" apps/dashboard/src/
```

Expected: empty.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/settings/agents-md-editor.tsx apps/dashboard/
git commit -m "refactor(dashboard): rename UserMdEditor → AgentsMdEditor component

Drop 'user profile' / 'user bio' labels in favor of 'operating manual'.

Refs #86"
```

---

### Task 12: Update `use-settings.ts` + `mutations.ts`

**Files:**
- Modify: `apps/dashboard/src/lib/use-settings.ts`
- Modify: `apps/dashboard/src/lib/mutations.ts`

- [ ] **Step 1: Find every USER.md ref**

```bash
grep -n "USER\.md\|userMd\|user-md" apps/dashboard/src/lib/use-settings.ts apps/dashboard/src/lib/mutations.ts
```

- [ ] **Step 2: Apply edits**

For each hit:
- field/prop name `userMd` → `agentsMd`
- URL path `USER.md` → `AGENTS.md`
- mutation key `userMd` → `agentsMd`

- [ ] **Step 3: Verify**

```bash
grep -n "USER\.md\|userMd" apps/dashboard/src/lib/use-settings.ts apps/dashboard/src/lib/mutations.ts
```

Expected: empty.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/lib/use-settings.ts apps/dashboard/src/lib/mutations.ts
git commit -m "refactor(dashboard): update use-settings + mutations to AGENTS.md

Refs #86"
```

---

### Task 13: Update dashboard routes + sidebar + cron-form

**Files:**
- Modify: `apps/dashboard/src/routes/_authed/settings.tsx`
- Modify: `apps/dashboard/src/routes/_authed/index.tsx`
- Modify: `apps/dashboard/src/components/layout/dashboard-sidebar.tsx`
- Modify: `apps/dashboard/src/components/crons/cron-form.tsx`

- [ ] **Step 1: Find every remaining USER.md ref in the dashboard**

```bash
grep -rn "USER\.md\|user-md\|userMd\|UserMd\|User profile\|User bio" apps/dashboard/src/
```

- [ ] **Step 2: Apply edits**

For each hit, replace the USER → AGENTS rename. Visible labels in `settings.tsx` and `dashboard-sidebar.tsx`: "User profile" → "Operating manual" (or equivalent — see Task 11 constraint).

- [ ] **Step 3: Run dashboard typecheck**

```bash
pnpm --filter @zeno/dashboard typecheck
```

Expected: PASS.

- [ ] **Step 4: Verify**

```bash
grep -rn "USER\.md\|user-md\|userMd\|User profile\|User bio" apps/dashboard/src/
```

Expected: empty.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/
git commit -m "refactor(dashboard): finish USER → AGENTS rename in routes + sidebar + cron-form

Refs #86"
```

---

### Task 14: Update sidebar test fixture

**Files:**
- Modify: `apps/dashboard/tests/components/sidebar.test.tsx`

- [ ] **Step 1: Find USER.md refs**

```bash
grep -n "USER\.md\|user-md\|userMd\|User profile" apps/dashboard/tests/components/sidebar.test.tsx
```

- [ ] **Step 2: Update fixtures + assertions**

Replace `'USER.md'` → `'AGENTS.md'`, `User profile` → `Operating manual` (or whatever the visible label is now), etc.

- [ ] **Step 3: Run dashboard tests**

```bash
pnpm --filter @zeno/dashboard test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/tests/components/sidebar.test.tsx
git commit -m "test(dashboard): update sidebar test to AGENTS.md

Refs #86"
```

---

## Phase 5 — Templates + docs

### Task 15: Move `templates/profile/USER.md` → `AGENTS.md` (rewrite content)

**Files:**
- Delete: `templates/profile/USER.md`
- Create: `templates/profile/AGENTS.md`

- [ ] **Step 1: Delete the old template**

```bash
git rm templates/profile/USER.md
```

- [ ] **Step 2: Create the new template**

Create `templates/profile/AGENTS.md` with the exact content specified in the plan's "Default `templates/profile/AGENTS.md`" section. Copy-paste verbatim from [[plan-agents-md-per-instance]] (the code block under "Default ..."). No placeholders, no FN-specific content.

- [ ] **Step 3: Verify the file is exactly as specified**

```bash
head -50 templates/profile/AGENTS.md
```

Confirm no `<your-name>`, no `<auto-detected-tz>`, no FN-specific references, no `fn-conduct` mention.

- [ ] **Step 4: Commit**

```bash
git add templates/profile/AGENTS.md
git commit -m "feat(templates): replace USER.md template with AGENTS.md operating manual

Static skeleton. No placeholder substitution. Generic — no profile-specific
content.

Refs #86"
```

---

### Task 16: Update `templates/profile/README.md`

**Files:**
- Modify: `templates/profile/README.md`

- [ ] **Step 1: Find USER.md refs**

```bash
grep -n "USER\.md" templates/profile/README.md
```

- [ ] **Step 2: Apply edits**

Replace every `USER.md` → `AGENTS.md`. Update any prose that frames the file as "user bio" to "operating manual".

- [ ] **Step 3: Commit**

```bash
git add templates/profile/README.md
git commit -m "docs(templates): update profile README to reference AGENTS.md

Refs #86"
```

---

### Task 17: Update `apps/docs/content/docs/{cli,profile,profiles}.mdx` + regen CLI flags

**Files:**
- Modify: `apps/docs/content/docs/cli.mdx`
- Modify: `apps/docs/content/docs/profile.mdx`
- Modify: `apps/docs/content/docs/profiles.mdx`
- Modify: `apps/docs/src/generated/cli-flags/profile-create.mdx` (regenerate)

- [ ] **Step 1: Find every USER.md ref in apps/docs**

```bash
grep -rn "USER\.md\|user-md\|user_md" apps/docs/
```

- [ ] **Step 2: Edit each non-generated file**

For `cli.mdx`, `profile.mdx`, `profiles.mdx`: replace each `USER.md` → `AGENTS.md` and adjust prose framing from "user bio" / "operator description" to "operating manual" where the meaning shifts.

- [ ] **Step 3: Regenerate the auto-generated CLI flags mdx**

```bash
pnpm --filter @zeno/docs run generate:cli-flags
```

(If the script name differs in `apps/docs/package.json`, inspect `apps/docs/scripts/` and run the corresponding script. The MySQL spec mentions `apps/docs/scripts/generate-cli-flag-tables.ts`.)

Expected: `apps/docs/src/generated/cli-flags/profile-create.mdx` updated to reflect the CLI changes from Task 8.

- [ ] **Step 4: Build the docs site**

```bash
pnpm --filter @zeno/docs build
```

Expected: PASS.

- [ ] **Step 5: Verify**

```bash
grep -rn "USER\.md" apps/docs/
```

Expected: empty.

- [ ] **Step 6: Commit**

```bash
git add apps/docs/
git commit -m "docs(docs-site): replace USER.md with AGENTS.md across published docs

Includes regenerated profile-create CLI flag table.

Refs #86"
```

---

### Task 18: Update `apps/web/src/sections/how-it-works-section.tsx`

**Files:**
- Modify: `apps/web/src/sections/how-it-works-section.tsx`

- [ ] **Step 1: Find USER.md refs**

```bash
grep -n "USER\.md\|user-md\|user_md" apps/web/src/sections/how-it-works-section.tsx
```

- [ ] **Step 2: Apply edits**

If `USER.md` is a label, replace with `AGENTS.md`. If the surrounding copy framed it as "user profile", reword to "operating manual" (or strip the reference entirely if it doesn't add value to the landing page).

- [ ] **Step 3: Build the landing**

```bash
pnpm --filter @zeno/web build
```

Expected: PASS.

- [ ] **Step 4: Verify**

```bash
grep -n "USER\.md" apps/web/src/sections/how-it-works-section.tsx
```

Expected: empty.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/sections/how-it-works-section.tsx
git commit -m "docs(web): swap USER.md for AGENTS.md in landing copy

Refs #86"
```

---

## Phase 6 — Repo + agent identity + constitution

### Task 19: Update repo-root `AGENTS.md`

**Files:**
- Modify: `AGENTS.md` (repo root) — `CLAUDE.md` is already a symlink, no separate edit.

- [ ] **Step 1: Find the USER.md ref**

```bash
grep -n "USER\.md" AGENTS.md
```

Expected: line 3 (and possibly others).

- [ ] **Step 2: Apply edits**

Replace `~/.zeno/profiles/<profile>/USER.md` → `~/.zeno/profiles/<profile>/AGENTS.md`. Replace any "operator" / "user" framing if the prose says "the operator is described in USER.md" — reword to "operator-specific operating manual lives in AGENTS.md".

- [ ] **Step 3: Verify CLAUDE.md symlink still resolves to the same file**

```bash
readlink CLAUDE.md
```

Expected: `AGENTS.md`.

- [ ] **Step 4: Verify**

```bash
grep -n "USER\.md" AGENTS.md CLAUDE.md
```

Expected: empty.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs(repo): update repo-root AGENTS.md to reference per-profile AGENTS.md

Refs #86"
```

---

### Task 20: Update `agent/SOUL.md`

**Files:**
- Modify: `agent/SOUL.md`

- [ ] **Step 1: Find the USER.md ref**

```bash
grep -n "USER\.md" agent/SOUL.md
```

Expected: one hit in the "Language and tone" section.

- [ ] **Step 2: Apply edit**

Replace:
```
Respond in the language the user addresses you in. If `USER.md` specifies
a preferred language, use that. Be direct and practical, minimal fluff.
```
with:
```
Respond in the language the user addresses you in. If `AGENTS.md` specifies
a preferred language, use that. Be direct and practical, minimal fluff.
```

- [ ] **Step 3: Verify**

```bash
grep -n "USER\.md" agent/SOUL.md
```

Expected: empty.

- [ ] **Step 4: Commit**

```bash
git add agent/SOUL.md
git commit -m "docs(agent): update SOUL.md language note to reference AGENTS.md

Refs #86"
```

---

### Task 21: Update `.vault/constitution.md` (5 lines)

**Files:**
- Modify: `.vault/constitution.md`

- [ ] **Step 1: Inspect the current state of the five target lines**

```bash
sed -n '13p;28p;47p;48p;88p' .vault/constitution.md
```

Confirm the lines match what the spec describes.

- [ ] **Step 2: Edit line 13**

Replace:
```
Zeno is a personal agent that operates across the apps you use, by composing the connectors you install. The owner is described in `profiles/<name>/USER.md` (gitignored — see `profiles/default/USER.example.md` for the template). This repository is Zeno's workspace — the place where its identity, configuration, and operating knowledge live.
```
with:
```
Zeno is a personal agent that operates across the apps you use, by composing the connectors you install. The per-instance operating manual lives in `profiles/<name>/AGENTS.md` (gitignored). This repository is Zeno's workspace — the place where its identity, configuration, and operating knowledge live.
```

- [ ] **Step 3: Edit line 28**

Replace:
```
- **Personal scope.** Zeno is single-user — the user defined in `USER.md`. Multi-user (allowlists, OAuth per user, billing isolation) is explicitly deferred until the use case appears.
```
with:
```
- **Single-operator, multi-audience-capable.** Each Zeno instance is owned by one operator (the OAuth-token holder) and may serve multiple audiences on the same channel (e.g., several people in one Slack workspace). Multi-tenant scope — allowlists, OAuth per user, billing isolation — is explicitly deferred until the use case appears.
```

- [ ] **Step 4: Edit line 47**

Replace:
```
- **Sandboxed execution.** The agent runs inside a Docker container with no shell or filesystem access of its own — capabilities flow exclusively through connector MCP subprocesses spawned by the worker. The container has no host filesystem access beyond mounted volumes (`workspace`, `USER.md` read-only).
```
with:
```
- **Sandboxed execution.** The agent runs inside a Docker container with no shell or filesystem access of its own — capabilities flow exclusively through connector MCP subprocesses spawned by the worker. The container has no host filesystem access beyond mounted volumes (`workspace`, `AGENTS.md` read-only).
```

- [ ] **Step 5: Edit line 48**

Replace:
```
- **OAuth, not API key.** Claude is accessed via `CLAUDE_CODE_OAUTH_TOKEN` (subscription auth), not `ANTHROPIC_API_KEY`. This aligns the cost model with personal use and respects the design constraint set by the user. Migration to API key (or enterprise auth) is reserved for the day Zeno serves multiple people.
```
with:
```
- **OAuth, not API key.** Claude is accessed via `CLAUDE_CODE_OAUTH_TOKEN` (subscription auth), not `ANTHROPIC_API_KEY`. This aligns the cost model with personal use and respects the design constraint set by the operator. Migration to API key (or enterprise auth) is reserved for the day Zeno serves multiple billed operators — note that "audiences" (people on a channel) and "operators" (token holders) are distinct; multi-audience use is already current reality.
```

- [ ] **Step 6: Edit line 88**

Replace:
```
- Runtime context the agent actually needs is narrow: who the user is (`USER.md`, mounted), the system prompt (built at boot), and the MCP tools exposed by the connectors the operator has enabled via the dashboard.
```
with:
```
- Runtime context the agent actually needs is narrow: the per-instance operating manual (`AGENTS.md`, mounted), the system prompt (built at boot), and the MCP tools exposed by the connectors the operator has enabled via the dashboard.
```

- [ ] **Step 7: Verify**

```bash
grep -n "USER\.md\|single-user" .vault/constitution.md
```

Expected: empty.

- [ ] **Step 8: Commit**

```bash
git add .vault/constitution.md
git commit -m "docs(constitution): reframe single-user → single-operator + USER.md → AGENTS.md

Edits five lines (13, 28, 47, 48, 88). The line-28 reframe distinguishes
audiences (people on a channel, plural in current reality) from operators
(token holders, still singular). The line-48 reword keeps the OAuth/API-key
principle internally consistent.

Refs #86"
```

---

## Phase 7 — Migration FN profile (off-repo, maintainer-driven)

### Task 22: Migrate `~/.zeno/profiles/fn/`

**Files (off-repo):**
- Delete: `~/.zeno/profiles/fn/USER.md`
- Create: `~/.zeno/profiles/fn/AGENTS.md`

**Important:** these paths are OUTSIDE the repo (off-repo profile directory). Changes are not committed to git. The PR description references this migration as part of the operator-side handoff.

- [ ] **Step 1: Stop the FN profile**

```bash
zeno stop fn
```

- [ ] **Step 2: Rename + replace content**

```bash
mv ~/.zeno/profiles/fn/USER.md ~/.zeno/profiles/fn/AGENTS.md
```

Then open `~/.zeno/profiles/fn/AGENTS.md` and replace its content with the exact content specified in [[plan-agents-md-per-instance]]'s "FN profile `AGENTS.md`" section (copy-paste verbatim). Operator reviews + commits to local FS only (the file is gitignored).

- [ ] **Step 3: Start the FN profile**

```bash
zeno start fn
```

- [ ] **Step 4: Verify the boot logs**

```bash
zeno logs fn --tail 50 | grep -E 'agents_md|user_md'
```

Expected: one line containing `agents_md_loaded` with a `bytes` field. Zero lines containing `user_md`. (If the worker logs `agents_md_missing`, the rename did not succeed — re-check Step 2.)

- [ ] **Step 5: Confirm no `USER.md` in the FN profile directory**

```bash
ls ~/.zeno/profiles/fn/
```

Expected: `AGENTS.md` present, `USER.md` absent.

- [ ] **Step 6: No commit (off-repo).**

This task does not produce a git commit. The state change lives in the operator's local filesystem and is referenced in the PR description.

---

## Phase 8 — Verification + ship

### Task 23: Final acceptance check — `git grep` + quality-gate

**Files:** none (verification only).

- [ ] **Step 1: Run the global grep AC**

```bash
git grep -E 'USER\.md|user-md|use-user-md|UserMd|parse-user-md|user_md_' apps/ packages/ templates/ agent/ AGENTS.md CLAUDE.md
```

Expected output: **empty** (zero matches).

If matches surface, find the file and apply the appropriate Phase-1-to-6 edit. Common surprises: a comment in a test fixture, a string in a Markdown link, a JSDoc that wasn't grep-caught in the per-file pass. Patch + re-run until clean.

- [ ] **Step 2: Run the quality-gate**

```bash
pnpm run quality-gate
```

Expected: green (all linters + typecheck + tests pass).

- [ ] **Step 3: Spot-check the smoke artifact**

Restart the FN profile (already done in Task 22 Step 3 if Phase 7 ran before Phase 8) and read the boot log:

```bash
zeno logs fn --tail 50 | grep agents_md_loaded
```

Expected: one line with `agents_md_loaded`, `bytes: <int>`, message `AGENTS.md loaded`.

- [ ] **Step 4: No commit yet.**

Verification only. The next task opens the PR.

---

### Task 24: Open PR via `/new-pr`

**Files:** none (workflow step).

- [ ] **Step 1: Confirm branch state**

```bash
git status
git log --oneline main..HEAD
```

Expected: clean working tree; ~21 commits on `feat/agents-md-per-instance` matching the phases above.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feat/agents-md-per-instance
```

- [ ] **Step 3: Invoke the project's `/new-pr` skill**

Inside Claude Code, run the `/new-pr` slash command. Use the title:

```
refactor(profile): replace USER.md with per-instance AGENTS.md (#86)
```

PR body (high-level — the skill's template enforces the exact shape):

- Summary: 1-3 bullets per phase.
- Spec / issue: link to [[spec-agents-md-per-instance]] on the branch; `Closes #86`.
- Test plan: `pnpm run quality-gate` green; `git grep -E ...` returns empty; FN profile boots with `agents_md_loaded`; smoke test (operator-only) on FN.
- Sanitization: checked.
- Quality gate: checked.

- [ ] **Step 4: Roadmap update (post-merge)**

After the PR merges, move issue #86 from `ROADMAP.md`'s `Next` section to `Recently shipped` per the project's roadmap convention. This is a follow-up PR (`docs(roadmap): move #86 agents-md ...`), not part of this branch.

- [ ] **Step 5: Update spec frontmatter**

After the PR merges, edit [[spec-agents-md-per-instance]] frontmatter: `status: shipped`, `shipped: <YYYY-MM-DD>`. Commit on `main` (or a follow-up branch) with `docs(spec): mark agents-md-per-instance as shipped`.

- [ ] **Step 6: Post-ship reflection (per project convention)**

Per the repo-root `AGENTS.md` "After completing a spec" section: ask "what did I learn implementing this that wasn't obvious from the spec?" If any non-obvious learning, create an atomic note in `.vault/learnings/` and link it to this spec. If nothing non-obvious, say so explicitly.

---

## Notes for the implementer

- **One commit per task.** The repo prefers small, reviewable commits over a single squash.
- **Quality-gate at every Phase boundary.** Don't accumulate failures across phases — fix as you go.
- **Don't touch `.vault/specs/*/` history** (per [[constitution]] and project convention). Phase 6 only edits `.vault/constitution.md`, not any other `.vault/` file.
- **No `--no-verify`.** Pre-commit hooks must run green. If a hook fails, fix the root cause, re-stage, commit again.
- **FN-specific content stays in the FN profile.** Never copy the FN-specific AGENTS.md into the default template or into anything inside the repo. The default template stays generic.
