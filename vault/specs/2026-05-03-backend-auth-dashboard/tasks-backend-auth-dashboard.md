---
feature: backend-auth-dashboard
plan: "[[plan-backend-auth-dashboard]]"
spec: "[[spec-backend-auth-dashboard]]"
created: 2026-05-03
---
# 0071 — Backend auth via dashboard — Tasks

**For this plan:** `[[plan-backend-auth-dashboard]]`

> **Cleanup contract:** [tmp/zeno-cleanup-contract.md](../../../tmp/zeno-cleanup-contract.md). 3-clean-reviews per phase + final. E2E via Slack channel `https://acme.slack.com/archives/C0EXAMPLE000`. Owner is the implementer (full autonomy in scope). Branch: `feat/spec-2026-05-03-backend-auth-dashboard`. PR opened only at end (not on `main`).

## Phase 0 — Crypto + env foundation

### Task 0.1 — Add `ZENO_MASTER_KEY` to env schema

**Files:**
- Modify: `apps/worker/src/config.ts`
- Test: `apps/worker/tests/config.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// apps/worker/tests/config.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig } from '@/config';

describe('loadConfig', () => {
  beforeEach(() => {
    process.env.GH_TOKEN = 'gh_x';
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-old';
  });

  it('rejects when ZENO_MASTER_KEY missing', () => {
    delete process.env.ZENO_MASTER_KEY;
    expect(() => loadConfig()).toThrow(/ZENO_MASTER_KEY/);
  });

  it('rejects when ZENO_MASTER_KEY is not 64-hex-char', () => {
    process.env.ZENO_MASTER_KEY = 'shortkey';
    expect(() => loadConfig()).toThrow(/64.*hex/);
  });

  it('accepts a valid 64-hex master key', () => {
    process.env.ZENO_MASTER_KEY = 'a'.repeat(64);
    const cfg = loadConfig();
    expect(cfg.masterKey).toEqual(Buffer.from('a'.repeat(64), 'hex'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zeno/worker test -- config.test`
Expected: FAIL with "loadConfig is not a function" or "ZENO_MASTER_KEY missing".

- [ ] **Step 3: Add to schema**

Edit `apps/worker/src/config.ts`:

```ts
import { z } from 'zod';

const HEX_64 = /^[0-9a-fA-F]{64}$/;

const schema = z.object({
  GH_TOKEN: z.string().min(1),
  CLAUDE_CODE_OAUTH_TOKEN: z.string().min(1).optional(), // legacy import only — Phase I drops it from .env.example
  ZENO_MASTER_KEY: z.string().regex(HEX_64, 'ZENO_MASTER_KEY must be 64 hex chars (32 bytes)'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  WORKSPACE_DIR: z.string().default('/workspace'),
  LOGS_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(7),
});

export type Config = {
  github: { token: string };
  claude: { legacyOauthToken: string | null };
  masterKey: Buffer;
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  workspaceDir: string;
  logsRetentionDays: number;
};

export function loadConfig(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  const env = parsed.data;
  return {
    github: { token: env.GH_TOKEN },
    claude: { legacyOauthToken: env.CLAUDE_CODE_OAUTH_TOKEN ?? null },
    masterKey: Buffer.from(env.ZENO_MASTER_KEY, 'hex'),
    logLevel: env.LOG_LEVEL,
    workspaceDir: env.WORKSPACE_DIR,
    logsRetentionDays: env.LOGS_RETENTION_DAYS,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zeno/worker test -- config.test`
Expected: PASS (3 specs).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/config.ts apps/worker/tests/config.test.ts
git commit -m "feat(worker): add ZENO_MASTER_KEY env validation (spec 0071 Phase 0)"
```

### Task 0.2 — Create `packages/storage/src/crypto.ts`

**Files:**
- Create: `packages/storage/src/crypto.ts`
- Test: `packages/storage/tests/crypto.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/storage/tests/crypto.test.ts
import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '@/crypto';

describe('crypto', () => {
  const masterKey = Buffer.from('a'.repeat(64), 'hex');
  const profileA = 'default';
  const profileB = 'fn';

  it('round-trips plaintext', () => {
    const { iv, ciphertext } = encrypt(masterKey, profileA, 'sk-ant-secret');
    expect(decrypt(masterKey, profileA, iv, ciphertext)).toBe('sk-ant-secret');
  });

  it('produces a fresh IV per call', () => {
    const a = encrypt(masterKey, profileA, 'x');
    const b = encrypt(masterKey, profileA, 'x');
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it('fails noisily with the wrong profile id (DEK mismatch)', () => {
    const { iv, ciphertext } = encrypt(masterKey, profileA, 'x');
    expect(() => decrypt(masterKey, profileB, iv, ciphertext)).toThrow();
  });

  it('fails noisily with the wrong master key', () => {
    const otherKey = Buffer.from('b'.repeat(64), 'hex');
    const { iv, ciphertext } = encrypt(masterKey, profileA, 'x');
    expect(() => decrypt(otherKey, profileA, iv, ciphertext)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zeno/storage test -- crypto.test`
Expected: FAIL with "Cannot find module '@/crypto'".

- [ ] **Step 3: Implement crypto.ts**

```ts
// packages/storage/src/crypto.ts
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function deriveDek(masterKey: Buffer, profileId: string): Buffer {
  // HKDF-SHA256 — info binds the DEK to a profile, salt is fixed (per-master-key family)
  const salt = Buffer.from('zeno-backend-credentials-v1', 'utf8');
  const info = Buffer.from(`profile:${profileId}`, 'utf8');
  return Buffer.from(hkdfSync('sha256', masterKey, salt, info, 32));
}

export interface EncryptedBlob {
  iv: Buffer;
  ciphertext: Buffer; // ciphertext || authTag
}

export function encrypt(masterKey: Buffer, profileId: string, plaintext: string): EncryptedBlob {
  const dek = deriveDek(masterKey, profileId);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, dek, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv, ciphertext: Buffer.concat([enc, tag]) };
}

export function decrypt(masterKey: Buffer, profileId: string, iv: Buffer, ciphertext: Buffer): string {
  const dek = deriveDek(masterKey, profileId);
  const tag = ciphertext.subarray(ciphertext.length - TAG_LEN);
  const data = ciphertext.subarray(0, ciphertext.length - TAG_LEN);
  const decipher = createDecipheriv(ALG, dek, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zeno/storage test -- crypto.test`
Expected: PASS (4 specs).

- [ ] **Step 5: Commit**

```bash
git add packages/storage/src/crypto.ts packages/storage/tests/crypto.test.ts
git commit -m "feat(storage): AES-256-GCM envelope crypto with per-profile HKDF DEK (spec 0071 Phase 0)"
```

## Phase A — Storage migration + repos

### Task A.1 — Migration: `backend_credentials` + `backend_settings` tables

**Files:**
- Modify: `packages/storage/src/migrations.ts`
- Test: `packages/storage/tests/migrations.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/storage/tests/migrations.test.ts (add)
it('creates backend_credentials table after 0071 migration', () => {
  const db = openDb(':memory:');
  runMigrations(db);
  const cols = db.prepare(`PRAGMA table_info(backend_credentials)`).all();
  const names = cols.map((c: any) => c.name);
  expect(names).toEqual(
    expect.arrayContaining([
      'id', 'profile_id', 'backend_id', 'field_name',
      'value_encrypted', 'iv', 'status', 'last_tested_at',
      'last_auth_alert_at', 'created_at', 'updated_at',
    ])
  );
});

it('creates backend_settings table after 0071 migration', () => {
  const db = openDb(':memory:');
  runMigrations(db);
  const cols = db.prepare(`PRAGMA table_info(backend_settings)`).all();
  const names = cols.map((c: any) => c.name);
  expect(names).toEqual(expect.arrayContaining(['profile_id', 'key', 'value']));
});

it('is idempotent — running migrations twice yields identical schema', () => {
  const db = openDb(':memory:');
  runMigrations(db);
  const before = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' ORDER BY name`).all();
  runMigrations(db);
  const after = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' ORDER BY name`).all();
  expect(after).toEqual(before);
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `pnpm --filter @zeno/storage test -- migrations.test`

- [ ] **Step 3: Add migration block**

Edit `packages/storage/src/migrations.ts` — append at the end of the migration list:

```ts
{
  id: '0071_backend_credentials_and_settings',
  sql: `
    CREATE TABLE IF NOT EXISTS backend_credentials (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      backend_id TEXT NOT NULL,
      field_name TEXT NOT NULL,
      value_encrypted BLOB NOT NULL,
      iv BLOB NOT NULL,
      status TEXT NOT NULL DEFAULT 'untested',
      last_tested_at INTEGER,
      last_auth_alert_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(profile_id, backend_id, field_name)
    );

    CREATE INDEX IF NOT EXISTS idx_backend_credentials_profile_backend
      ON backend_credentials(profile_id, backend_id);

    CREATE TABLE IF NOT EXISTS backend_settings (
      profile_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (profile_id, key)
    );
  `,
},
```

- [ ] **Step 4: Run test to verify PASS**

Run: `pnpm --filter @zeno/storage test -- migrations.test`

- [ ] **Step 5: Commit**

```bash
git add packages/storage/src/migrations.ts packages/storage/tests/migrations.test.ts
git commit -m "feat(storage): backend_credentials + backend_settings tables (spec 0071 Phase A)"
```

### Task A.2 — Migration: encrypt-in-place existing `connector_secrets`

**Files:**
- Modify: `packages/storage/src/migrations.ts`
- Test: `packages/storage/tests/migrations.test.ts`

- [ ] **Step 1: Write failing test**

```ts
it('migrates connector_secrets from value TEXT to value_encrypted BLOB + iv BLOB', () => {
  const db = openDb(':memory:');
  // simulate pre-0071 schema + a row
  runMigrationsUpTo(db, '0070_design_md_format');
  db.prepare(`INSERT INTO connector_secrets (id, connector_id, key, value, created_at, updated_at)
              VALUES ('s1', 'c1', 'token', 'plaintext-secret', 1, 1)`).run();
  // run remaining migrations including 0071
  runMigrations(db, { masterKey: Buffer.from('a'.repeat(64), 'hex'), profileId: 'default' });
  const row = db.prepare(`SELECT value_encrypted, iv FROM connector_secrets WHERE id='s1'`).get() as any;
  expect(row.value_encrypted).toBeInstanceOf(Buffer);
  expect(row.iv).toBeInstanceOf(Buffer);
  // and the old `value` column is gone
  const cols = db.prepare(`PRAGMA table_info(connector_secrets)`).all();
  expect(cols.some((c: any) => c.name === 'value')).toBe(false);
});
```

- [ ] **Step 2: Run to FAIL**

- [ ] **Step 3: Implement encrypt-in-place migration**

Edit `packages/storage/src/migrations.ts`:

```ts
// Replace the previous 0071 block with this expanded one:
{
  id: '0071_backend_auth_dashboard',
  // sql: '' — too complex for plain SQL; uses function
  fn: (db, opts) => {
    const { masterKey, profileId } = opts ?? {};
    if (!masterKey || !profileId) {
      throw new Error('Migration 0071 requires masterKey + profileId in runMigrations options');
    }
    db.exec(`BEGIN TRANSACTION;
      CREATE TABLE IF NOT EXISTS backend_credentials (...same as A.1...);
      CREATE INDEX IF NOT EXISTS idx_backend_credentials_profile_backend ON backend_credentials(profile_id, backend_id);
      CREATE TABLE IF NOT EXISTS backend_settings (...same as A.1...);

      ALTER TABLE connector_secrets ADD COLUMN value_encrypted BLOB;
      ALTER TABLE connector_secrets ADD COLUMN iv BLOB;
    `);
    const rows = db.prepare(`SELECT id, value FROM connector_secrets WHERE value IS NOT NULL AND value_encrypted IS NULL`).all() as Array<{id: string; value: string}>;
    const upd = db.prepare(`UPDATE connector_secrets SET value_encrypted=?, iv=?, value=NULL WHERE id=?`);
    for (const row of rows) {
      const { iv, ciphertext } = encrypt(masterKey, profileId, row.value);
      upd.run(ciphertext, iv, row.id);
    }
    // Drop the old TEXT column via table-rebuild (SQLite doesn't support DROP COLUMN < 3.35)
    db.exec(`
      CREATE TABLE connector_secrets__new (
        id TEXT PRIMARY KEY,
        connector_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value_encrypted BLOB NOT NULL,
        iv BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(connector_id, key)
      );
      INSERT INTO connector_secrets__new SELECT id, connector_id, key, value_encrypted, iv, created_at, updated_at FROM connector_secrets;
      DROP TABLE connector_secrets;
      ALTER TABLE connector_secrets__new RENAME TO connector_secrets;
      COMMIT;
    `);
  },
},
```

Pre-migration backup of the DB file is the caller's responsibility — see Task C.7 boot wiring.

- [ ] **Step 4: Update `runMigrations` signature** to accept `{ masterKey, profileId }`. Update callers in worker boot to pass `loadConfig().masterKey` and `process.env.ZENO_PROFILE`.

- [ ] **Step 5: Run test to PASS**

- [ ] **Step 6: Commit**

```bash
git add packages/storage/src/migrations.ts packages/storage/tests/migrations.test.ts
git commit -m "feat(storage): encrypt-in-place connector_secrets migration (spec 0071 Phase A)"
```

### Task A.3 — Repo: `backend-credentials.ts`

**Files:**
- Create: `packages/storage/src/repos/backend-credentials.ts`
- Test: `packages/storage/tests/repos/backend-credentials.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, runMigrations } from '@/index';
import { BackendCredentialsRepo } from '@/repos/backend-credentials';

const masterKey = Buffer.from('a'.repeat(64), 'hex');
const profileId = 'default';

describe('BackendCredentialsRepo', () => {
  let repo: BackendCredentialsRepo;

  beforeEach(() => {
    const db = openDb(':memory:');
    runMigrations(db, { masterKey, profileId });
    repo = new BackendCredentialsRepo(db, { masterKey, profileId });
  });

  it('upserts and reads back a credential field', () => {
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'sk-ant-x' });
    expect(repo.getValue('claude-code', 'oauth_token')).toBe('sk-ant-x');
  });

  it('upsert overwrites existing value', () => {
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'sk-ant-1' });
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'sk-ant-2' });
    expect(repo.getValue('claude-code', 'oauth_token')).toBe('sk-ant-2');
  });

  it('returns null for missing key', () => {
    expect(repo.getValue('claude-code', 'oauth_token')).toBeNull();
  });

  it('lists all backend statuses', () => {
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'x' });
    repo.setStatus('claude-code', 'active', Date.now());
    const all = repo.listStatuses();
    expect(all).toEqual([{ backendId: 'claude-code', status: 'active', lastTestedAt: expect.any(Number), lastAuthAlertAt: null }]);
  });
});
```

- [ ] **Step 2: Run to FAIL**

- [ ] **Step 3: Implement repo**

```ts
// packages/storage/src/repos/backend-credentials.ts
import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { encrypt, decrypt } from '@/crypto';

export type BackendStatus = 'untested' | 'active' | 'expired' | 'failed';

export interface BackendCredentialRow {
  backendId: string;
  status: BackendStatus;
  lastTestedAt: number | null;
  lastAuthAlertAt: number | null;
}

export class BackendCredentialsRepo {
  constructor(
    private readonly db: Database,
    private readonly opts: { masterKey: Buffer; profileId: string },
  ) {}

  upsert({ backendId, fieldName, value }: { backendId: string; fieldName: string; value: string }) {
    const { iv, ciphertext } = encrypt(this.opts.masterKey, this.opts.profileId, value);
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO backend_credentials (id, profile_id, backend_id, field_name, value_encrypted, iv, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'untested', ?, ?)
      ON CONFLICT(profile_id, backend_id, field_name) DO UPDATE SET
        value_encrypted = excluded.value_encrypted,
        iv = excluded.iv,
        status = 'untested',
        updated_at = excluded.updated_at
    `).run(randomUUID(), this.opts.profileId, backendId, fieldName, ciphertext, iv, now, now);
  }

  getValue(backendId: string, fieldName: string): string | null {
    const row = this.db.prepare(`
      SELECT value_encrypted, iv FROM backend_credentials
      WHERE profile_id = ? AND backend_id = ? AND field_name = ?
    `).get(this.opts.profileId, backendId, fieldName) as { value_encrypted: Buffer; iv: Buffer } | undefined;
    if (!row) return null;
    return decrypt(this.opts.masterKey, this.opts.profileId, row.iv, row.value_encrypted);
  }

  setStatus(backendId: string, status: BackendStatus, lastTestedAt: number | null) {
    this.db.prepare(`
      UPDATE backend_credentials
      SET status = ?, last_tested_at = ?, updated_at = ?
      WHERE profile_id = ? AND backend_id = ?
    `).run(status, lastTestedAt, Date.now(), this.opts.profileId, backendId);
  }

  setAuthAlertAt(backendId: string, ts: number | null) {
    this.db.prepare(`
      UPDATE backend_credentials
      SET last_auth_alert_at = ?, updated_at = ?
      WHERE profile_id = ? AND backend_id = ?
    `).run(ts, Date.now(), this.opts.profileId, backendId);
  }

  listStatuses(): BackendCredentialRow[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT backend_id, status, last_tested_at, last_auth_alert_at
      FROM backend_credentials WHERE profile_id = ?
    `).all(this.opts.profileId) as Array<{ backend_id: string; status: BackendStatus; last_tested_at: number | null; last_auth_alert_at: number | null }>;
    return rows.map((r) => ({
      backendId: r.backend_id,
      status: r.status,
      lastTestedAt: r.last_tested_at,
      lastAuthAlertAt: r.last_auth_alert_at,
    }));
  }

  delete(backendId: string) {
    this.db.prepare(`DELETE FROM backend_credentials WHERE profile_id = ? AND backend_id = ?`)
      .run(this.opts.profileId, backendId);
  }

  /** Latest updated_at across all rows — used by the credentials watcher. */
  latestUpdatedAt(): number | null {
    const row = this.db.prepare(`
      SELECT MAX(updated_at) as ts FROM backend_credentials WHERE profile_id = ?
    `).get(this.opts.profileId) as { ts: number | null };
    return row.ts;
  }
}
```

- [ ] **Step 4: Run test to PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/storage/src/repos/backend-credentials.ts packages/storage/tests/repos/backend-credentials.test.ts
git commit -m "feat(storage): BackendCredentialsRepo with encryption (spec 0071 Phase A)"
```

### Task A.4 — Repo: `backend-settings.ts`

**Files:**
- Create: `packages/storage/src/repos/backend-settings.ts`
- Test: `packages/storage/tests/repos/backend-settings.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, runMigrations } from '@/index';
import { BackendSettingsRepo } from '@/repos/backend-settings';

const masterKey = Buffer.from('a'.repeat(64), 'hex');

describe('BackendSettingsRepo', () => {
  let repo: BackendSettingsRepo;
  beforeEach(() => {
    const db = openDb(':memory:');
    runMigrations(db, { masterKey, profileId: 'default' });
    repo = new BackendSettingsRepo(db, 'default');
  });

  it('returns null for unknown key', () => {
    expect(repo.get('active_backend_id')).toBeNull();
  });

  it('upsert + get round-trip', () => {
    repo.set('active_backend_id', 'claude-code');
    expect(repo.get('active_backend_id')).toBe('claude-code');
    repo.set('active_backend_id', 'codex-cli');
    expect(repo.get('active_backend_id')).toBe('codex-cli');
  });
});
```

- [ ] **Step 2: Run to FAIL**

- [ ] **Step 3: Implement repo**

```ts
// packages/storage/src/repos/backend-settings.ts
import type { Database } from 'better-sqlite3';

export class BackendSettingsRepo {
  constructor(private readonly db: Database, private readonly profileId: string) {}

  get(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM backend_settings WHERE profile_id = ? AND key = ?`)
      .get(this.profileId, key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  set(key: string, value: string) {
    this.db.prepare(`
      INSERT INTO backend_settings (profile_id, key, value, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(profile_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(this.profileId, key, value, Date.now());
  }
}
```

- [ ] **Step 4: PASS + Commit**

```bash
git add packages/storage/src/repos/backend-settings.ts packages/storage/tests/repos/backend-settings.test.ts
git commit -m "feat(storage): BackendSettingsRepo (spec 0071 Phase A)"
```

### Task A.5 — Migrate `ConnectorsRepo` value reads/writes through crypto

**Files:**
- Modify: `packages/storage/src/repos/connectors.ts`
- Modify: existing connector tests to pass `{ masterKey, profileId }` constructor opts

- [ ] **Step 1: Find every plaintext `value` access in `connectors.ts`** (`grep -n "value" packages/storage/src/repos/connectors.ts`).

- [ ] **Step 2: Refactor constructor** to accept `{ masterKey: Buffer; profileId: string }` and store as `private`. Wherever a secret is written → call `encrypt`; wherever read → `decrypt`.

- [ ] **Step 3: Update all call sites** in `apps/api`, `apps/worker` to pass crypto opts when instantiating the repo.

- [ ] **Step 4: Run all storage tests** — fix any breakage from constructor signature change.

```bash
pnpm --filter @zeno/storage test
```

- [ ] **Step 5: Commit**

```bash
git add packages/storage/src/repos/connectors.ts packages/storage/tests/repos/connectors.test.ts apps/api/src apps/worker/src
git commit -m "refactor(storage): connectors repo reads/writes through crypto (spec 0071 Phase A)"
```

## Phase B — Backends catalog

### Task B.1 — Create `agent/backends-catalog.json`

**Files:**
- Create: `agent/backends-catalog.json`

- [ ] **Step 1: Write the catalog**

```json
{
  "_doc": "Catalog of available agent backends. Each entry describes how to authenticate. Today only claude-code; future codex-cli, gemini, etc.",
  "backends": [
    {
      "id": "claude-code",
      "name": "Claude Code",
      "description": "Anthropic's Claude via the official Claude Code OAuth subscription. Wraps `claude setup-token` for the auto-flow.",
      "logo": "agent/assets/backends/claude-code.png",
      "auth_schema": [
        {
          "field": "oauth_token",
          "label": "OAuth token",
          "type": "password",
          "regex": "^sk-ant-oat\\d{2}-[A-Za-z0-9_-]{50,}$",
          "regex_hint": "Tokens start with sk-ant-oat<NN>- and are 60+ chars."
        }
      ],
      "auto_flow": {
        "kind": "spawn-cli",
        "command": ["claude", "setup-token"],
        "stdout_url_regex": "(https?://[^\\s]*claude\\.ai[^\\s]*)",
        "stdout_token_regex": "(sk-ant-oat\\d{2}-[A-Za-z0-9_-]{50,})"
      },
      "test": {
        "kind": "claude-handshake",
        "model": "claude-haiku-4-5-20251001"
      },
      "setup_doc_url": "https://docs.anthropic.com/en/docs/claude-code/getting-started"
    }
  ]
}
```

- [ ] **Step 2: Verify well-formed**

```bash
jq '.' agent/backends-catalog.json
```

- [ ] **Step 3: Commit**

```bash
git add agent/backends-catalog.json
git commit -m "feat(agent): backends-catalog.json with claude-code entry (spec 0071 Phase B)"
```

### Task B.2 — Catalog loader in api

**Files:**
- Create: `apps/api/src/lib/backends-catalog.ts`
- Test: `apps/api/tests/lib/backends-catalog.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { loadBackendsCatalog } from '@/lib/backends-catalog';

describe('loadBackendsCatalog', () => {
  it('reads the on-disk catalog and validates the schema', () => {
    const cat = loadBackendsCatalog();
    expect(cat.backends.length).toBeGreaterThanOrEqual(1);
    const claude = cat.backends.find((b) => b.id === 'claude-code');
    expect(claude).toBeDefined();
    expect(claude!.auth_schema[0].field).toBe('oauth_token');
    expect(claude!.auto_flow.command).toEqual(['claude', 'setup-token']);
  });
});
```

- [ ] **Step 2: Run to FAIL**

- [ ] **Step 3: Implement loader**

```ts
// apps/api/src/lib/backends-catalog.ts
import { readFileSync } from 'node:fs';
import { z } from 'zod';

const AuthField = z.object({
  field: z.string(),
  label: z.string(),
  type: z.enum(['password', 'text']),
  regex: z.string().optional(),
  regex_hint: z.string().optional(),
});

const AutoFlow = z.object({
  kind: z.literal('spawn-cli'),
  command: z.array(z.string()).min(1),
  stdout_url_regex: z.string(),
  stdout_token_regex: z.string(),
});

const TestSpec = z.object({
  kind: z.literal('claude-handshake'),
  model: z.string(),
});

const Backend = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  logo: z.string(),
  auth_schema: z.array(AuthField).min(1),
  auto_flow: AutoFlow,
  test: TestSpec,
  setup_doc_url: z.string().url(),
});

const Catalog = z.object({
  backends: z.array(Backend).min(1),
});

export type BackendsCatalog = z.infer<typeof Catalog>;
export type CatalogBackend = z.infer<typeof Backend>;

const CANDIDATES = ['/app/agent/backends-catalog.json', 'agent/backends-catalog.json'];

export function loadBackendsCatalog(): BackendsCatalog {
  for (const path of CANDIDATES) {
    try {
      const raw = readFileSync(path, 'utf8');
      return Catalog.parse(JSON.parse(raw));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
  }
  throw new Error(`backends-catalog.json not found in any candidate: ${CANDIDATES.join(', ')}`);
}
```

- [ ] **Step 4: PASS + Commit**

```bash
git add apps/api/src/lib/backends-catalog.ts apps/api/tests/lib/backends-catalog.test.ts
git commit -m "feat(api): backends-catalog loader + zod schema (spec 0071 Phase B)"
```

## Phase C — Worker plumbing (no `process.env.CLAUDE_CODE_OAUTH_TOKEN`)

### Task C.1 — Worker reads token from DB on demand

**Files:**
- Create: `apps/worker/src/agent/credentials.ts`
- Test: `apps/worker/tests/agent/credentials.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, runMigrations } from '@zeno/storage';
import { BackendCredentialsRepo } from '@zeno/storage/repos/backend-credentials';
import { CredentialsService } from '@/agent/credentials';

const masterKey = Buffer.from('a'.repeat(64), 'hex');

describe('CredentialsService', () => {
  let svc: CredentialsService;
  beforeEach(() => {
    const db = openDb(':memory:');
    runMigrations(db, { masterKey, profileId: 'default' });
    const repo = new BackendCredentialsRepo(db, { masterKey, profileId: 'default' });
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'sk-ant-real' });
    svc = new CredentialsService({ repo });
  });

  it('returns the decrypted token for the active backend', () => {
    expect(svc.getActiveBackendToken({ backendId: 'claude-code' })).toBe('sk-ant-real');
  });

  it('returns null when no row exists', () => {
    const empty = new CredentialsService({ repo: new BackendCredentialsRepo(openDb(':memory:'), { masterKey, profileId: 'default' }) });
    expect(empty.getActiveBackendToken({ backendId: 'claude-code' })).toBeNull();
  });

  it('NEVER mutates process.env', () => {
    const before = { ...process.env };
    svc.getActiveBackendToken({ backendId: 'claude-code' });
    expect(process.env).toEqual(before);
    expect(process.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to FAIL**

- [ ] **Step 3: Implement**

```ts
// apps/worker/src/agent/credentials.ts
import type { BackendCredentialsRepo } from '@zeno/storage/repos/backend-credentials';

export class CredentialsService {
  constructor(private readonly deps: { repo: BackendCredentialsRepo }) {}

  /**
   * Returns the decrypted token for a backend's primary auth field (`oauth_token`)
   * or null if not configured. NEVER touches process.env. Caller must keep the
   * returned value out of any persistent log sink.
   */
  getActiveBackendToken({ backendId }: { backendId: string }): string | null {
    return this.deps.repo.getValue(backendId, 'oauth_token');
  }
}
```

- [ ] **Step 4: PASS + Commit**

```bash
git add apps/worker/src/agent/credentials.ts apps/worker/tests/agent/credentials.test.ts
git commit -m "feat(worker): CredentialsService reads token from DB without touching process.env (spec 0071 Phase C)"
```

### Task C.2 — Materializer writes `~/.claude/.credentials.json` atomically

**Files:**
- Create: `apps/worker/src/agent/credentials-materializer.ts`
- Test: `apps/worker/tests/agent/credentials-materializer.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { materializeClaudeCredentials } from '@/agent/credentials-materializer';

describe('materializeClaudeCredentials', () => {
  let claudeHome: string;
  beforeEach(() => { claudeHome = mkdtempSync(join(tmpdir(), 'claude-home-')); });

  it('writes .credentials.json atomically (no leftover .tmp)', async () => {
    await materializeClaudeCredentials({ claudeHome, oauthToken: 'sk-ant-x' });
    const target = join(claudeHome, '.credentials.json');
    expect(existsSync(target)).toBe(true);
    expect(existsSync(target + '.tmp')).toBe(false);
    const data = JSON.parse(readFileSync(target, 'utf8'));
    expect(data.claudeAiOauth.accessToken).toBe('sk-ant-x');
  });

  it('overwrites an existing file without leaking prior content', async () => {
    await materializeClaudeCredentials({ claudeHome, oauthToken: 'sk-ant-old' });
    await materializeClaudeCredentials({ claudeHome, oauthToken: 'sk-ant-new' });
    const data = JSON.parse(readFileSync(join(claudeHome, '.credentials.json'), 'utf8'));
    expect(data.claudeAiOauth.accessToken).toBe('sk-ant-new');
  });
});
```

- [ ] **Step 2: Run to FAIL**

- [ ] **Step 3: Implement**

```ts
// apps/worker/src/agent/credentials-materializer.ts
import { writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const mutex = new Map<string, Promise<void>>();

export async function materializeClaudeCredentials(opts: { claudeHome: string; oauthToken: string }) {
  const key = opts.claudeHome;
  const prev = mutex.get(key) ?? Promise.resolve();
  const next = prev.then(() => doWrite(opts));
  mutex.set(key, next.catch(() => {}));
  return next;
}

async function doWrite({ claudeHome, oauthToken }: { claudeHome: string; oauthToken: string }) {
  await mkdir(claudeHome, { recursive: true });
  const target = join(claudeHome, '.credentials.json');
  const tmp = `${target}.tmp`;
  const payload = JSON.stringify({
    claudeAiOauth: {
      accessToken: oauthToken,
      // SDK reads accessToken; other fields populated by `claude setup-token` are not required for query()
    },
  });
  await writeFile(tmp, payload, { mode: 0o600 });
  await rename(tmp, target);
}
```

- [ ] **Step 4: PASS + Commit**

```bash
git add apps/worker/src/agent/credentials-materializer.ts apps/worker/tests/agent/credentials-materializer.test.ts
git commit -m "feat(worker): atomic materializer for ~/.claude/.credentials.json (spec 0071 Phase C)"
```

### Task C.3 — `ClaudeCodeBackend` passes token via per-call `env`, never `process.env`

**Files:**
- Modify: `apps/worker/src/agent/backends/claude-code.ts`
- Modify: `apps/worker/tests/agent/backends/claude-code.test.ts`

- [ ] **Step 1: Add a failing test**

```ts
it('passes CLAUDE_CODE_OAUTH_TOKEN via per-call env, never process.env', async () => {
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  const fakeQuery = vi.fn(async function* () { yield { type: 'result', result: 'ok' }; });
  // inject fakeQuery into the backend...
  const backend = new ClaudeCodeBackend({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-x' } });
  await backend.query({ userMessage: 'hi', correlationId: '1' });
  expect(process.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  expect(fakeQuery).toHaveBeenCalledWith(expect.objectContaining({
    options: expect.objectContaining({ env: expect.objectContaining({ CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-x' }) }),
  }));
});
```

- [ ] **Step 2: Run to FAIL**

- [ ] **Step 3: Verify the existing code already passes `opts.env` to the SDK** (it does — see `claude-code.ts:124`). The change is in the **caller**: the worker boot must build `opts.env` from `CredentialsService` rather than relying on inherited `process.env`.

- [ ] **Step 4: Update the construction site** in `apps/worker/src/index.ts`:

```ts
const credentialsSvc = new CredentialsService({ repo: backendCredentialsRepo });

function backendEnvForActive(): Record<string, string | undefined> | undefined {
  const token = credentialsSvc.getActiveBackendToken({ backendId: 'claude-code' });
  if (!token) return undefined;
  return { CLAUDE_CODE_OAUTH_TOKEN: token };
}
```

Pass `env: backendEnvForActive()` into every `new ClaudeCodeBackend({...})`. Refresh on each `query()` call by reading from the service inside an `env: () => backendEnvForActive()` thunk if the SDK supports a function — otherwise re-instantiate per call (cheap).

- [ ] **Step 5: PASS + Commit**

```bash
git add apps/worker/src/agent/backends/claude-code.ts apps/worker/src/index.ts apps/worker/tests/agent/backends/claude-code.test.ts
git commit -m "fix(worker): pass Claude OAuth token via per-call SDK env, never process.env (spec 0071 Phase C)"
```

### Task C.4 — Watcher polls credentials → re-materializes file

**Files:**
- Create: `apps/worker/src/agent/credentials-watcher.ts`
- Test: `apps/worker/tests/agent/credentials-watcher.test.ts`

- [ ] **Step 1: Write failing test** — assert the watcher fires `materializeClaudeCredentials` when `repo.latestUpdatedAt()` changes.

- [ ] **Step 2: Implement (5s poll interval)**

```ts
// apps/worker/src/agent/credentials-watcher.ts
import type { BackendCredentialsRepo } from '@zeno/storage/repos/backend-credentials';
import { materializeClaudeCredentials } from './credentials-materializer';

export class CredentialsWatcher {
  private last: number | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: {
    repo: BackendCredentialsRepo;
    claudeHome: string;
    intervalMs?: number;
    logger?: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void };
  }) {}

  start() {
    const interval = this.deps.intervalMs ?? 5000;
    const tick = async () => {
      const ts = this.deps.repo.latestUpdatedAt();
      if (ts !== this.last) {
        this.last = ts;
        const token = this.deps.repo.getValue('claude-code', 'oauth_token');
        if (token) {
          await materializeClaudeCredentials({ claudeHome: this.deps.claudeHome, oauthToken: token });
          this.deps.logger?.info({ event: 'claude_credentials_materialized' }, 'wrote .credentials.json');
        }
      }
    };
    void tick(); // initial
    this.timer = setInterval(() => void tick(), interval);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
```

- [ ] **Step 3: PASS + Commit**

```bash
git add apps/worker/src/agent/credentials-watcher.ts apps/worker/tests/agent/credentials-watcher.test.ts
git commit -m "feat(worker): credentials watcher (5s poll → re-materialize) (spec 0071 Phase C)"
```

### Task C.5 — Boot graceful: skip Claude health check if no DB row

**Files:**
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/worker/tests/boot.test.ts` (or create)

- [ ] **Step 1: Write failing test** — `loadConfig()` returns no `claude.legacyOauthToken`, no DB row exists; boot must complete without throwing.

- [ ] **Step 2: Modify `healthChecks`**

```ts
async function healthChecks(logger: Logger, _config: Config, credentialsSvc: CredentialsService): Promise<void> {
  // gh — required
  // claude CLI binary — required (always present in container; needed for paste fallback + future commands)
  const claudeResult = await run('claude', ['--version']);
  if (claudeResult.code !== 0) throw new Error(`claude --version failed: ${claudeResult.err.slice(0, 200)}`);
  logger.info({ event: 'claude_cli_ok', version: claudeResult.out.trim() }, 'claude CLI available');

  // Token — optional. Worker is allowed to boot without one.
  const token = credentialsSvc.getActiveBackendToken({ backendId: 'claude-code' });
  if (!token) {
    logger.info({ event: 'claude_backend_unconfigured' }, 'no Claude credential in DB; worker will tell users to configure via dashboard');
  } else {
    logger.info({ event: 'claude_backend_configured' }, 'Claude credential loaded from DB');
  }
}
```

- [ ] **Step 3: PASS + Commit**

```bash
git add apps/worker/src/index.ts apps/worker/tests/boot.test.ts
git commit -m "feat(worker): graceful boot when no Claude credential configured (spec 0071 Phase C)"
```

### Task C.6 — Channel + cron handle "no backend"

**Files:**
- Modify: `apps/worker/src/agent/core.ts` (or wherever `query()` is invoked from the channel path)
- Modify: `apps/worker/src/cron/runner.ts`
- Test: `apps/worker/tests/agent/core.test.ts`

- [ ] **Step 1: Define a typed error**

```ts
// apps/worker/src/agent/types.ts (append)
export class NoBackendConfiguredError extends Error {
  constructor() { super('no backend configured'); this.name = 'NoBackendConfiguredError'; }
}
```

- [ ] **Step 2: In `agent/core.ts`** — before invoking the backend, check `credentialsSvc.getActiveBackendToken(...)`. If null, throw `NoBackendConfiguredError`.

- [ ] **Step 3: In the Slack channel handler** — catch `NoBackendConfiguredError` and reply: `"Claude is not configured. Open the dashboard to finish setup: <DASHBOARD_URL>/onboarding/connect-claude"`.

- [ ] **Step 4: In `cron/runner.ts`** — catch the same error and skip with `status='skipped_no_backend'`. Log once per cron firing.

- [ ] **Step 5: Tests** — assert the typed error path; verify no exception bubbles.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src
git commit -m "feat(worker): channel + cron handle NoBackendConfiguredError gracefully (spec 0071 Phase C)"
```

### Task C.7 — Wire migration with `{ masterKey, profileId }` + pre-migration backup

**Files:**
- Modify: `apps/worker/src/index.ts` (boot section that calls `runMigrations`)
- Modify: `packages/storage/src/migrations.ts` (accept opts)

- [ ] **Step 1: Backup helper**

```ts
import { copyFile, access } from 'node:fs/promises';
async function backupDbBeforeMigration(dbPath: string) {
  const backup = `${dbPath}.pre-0071-backup`;
  try { await access(backup); return; /* already backed up */ } catch {}
  await copyFile(dbPath, backup);
}
```

Call before `runMigrations(db, { masterKey: cfg.masterKey, profileId: process.env.ZENO_PROFILE ?? 'default' })`.

- [ ] **Step 2: Quality gate**

```bash
pnpm run quality-gate
```

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/index.ts packages/storage/src/migrations.ts
git commit -m "feat(worker): pre-migration DB backup + pass crypto opts to runMigrations (spec 0071 Phase C)"
```

## Phase D — Per-profile `claude_home` volume

### Task D.1 — Rename volume in compose files

**Files:**
- Modify: `infra/docker-compose.default.yml`
- Modify: `infra/docker-compose.fn.yml`

- [ ] **Step 1: Edit `infra/docker-compose.default.yml`**

```yaml
volumes:
  workspace-default:
  claude_home_default:   # renamed; no longer external
```

Update the `agent` service's volume mount:

```yaml
- claude_home_default:/home/node/.claude
```

- [ ] **Step 2: Same for `infra/docker-compose.fn.yml`** — `claude_home_fn`.

- [ ] **Step 3: Commit**

```bash
git add infra/docker-compose.default.yml infra/docker-compose.fn.yml
git commit -m "feat(infra): per-profile claude_home volume (spec 0071 Phase D)"
```

### Task D.2 — One-shot migration script

**Files:**
- Create: `infra/migrate-claude-home.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# Copies contents of the legacy shared `claude_home` volume into the per-profile
# `claude_home_<profile>` volume. Idempotent — safe to run multiple times.
# Usage: ./infra/migrate-claude-home.sh <profile>
set -euo pipefail
PROFILE="${1:?profile required (e.g. default, fn)}"
SRC=claude_home
DST="claude_home_${PROFILE}"

if ! docker volume inspect "$SRC" >/dev/null 2>&1; then
  echo "Source volume '$SRC' not found — nothing to migrate."
  exit 0
fi

if ! docker volume inspect "$DST" >/dev/null 2>&1; then
  docker volume create "$DST" >/dev/null
fi

docker run --rm \
  -v "$SRC":/from \
  -v "$DST":/to \
  alpine:3 \
  sh -c 'cp -an /from/. /to/ && echo "migrated"'

echo "Done. Old volume '$SRC' is preserved — delete manually after verifying with 'docker volume rm $SRC'."
```

- [ ] **Step 2: chmod**

```bash
chmod +x infra/migrate-claude-home.sh
```

- [ ] **Step 3: Commit**

```bash
git add infra/migrate-claude-home.sh
git commit -m "feat(infra): migrate-claude-home.sh (one-shot copy from shared to per-profile) (spec 0071 Phase D)"
```

## Phase E — API: `routes/backends.ts`

### Task E.1 — `GET /api/backends` (list with status)

**Files:**
- Create: `apps/api/src/routes/backends.ts`
- Modify: `apps/api/src/server.ts` (or wherever routes register)
- Test: `apps/api/tests/routes/backends.test.ts`

- [ ] **Step 1: Failing test** — assert response shape.

```ts
it('GET /api/backends returns catalog merged with statuses', async () => {
  const app = buildApp({ backendCredentialsRepo: stubRepo, catalogPath: 'agent/backends-catalog.json' });
  const res = await app.request('/api/backends');
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.backends[0]).toMatchObject({
    id: 'claude-code',
    name: 'Claude Code',
    status: 'not_configured',
    last_tested_at: null,
  });
  // value/value_encrypted/length/sha256 must NEVER appear
  expect(JSON.stringify(body)).not.toMatch(/value_encrypted/);
});
```

- [ ] **Step 2: Implement route**

```ts
// apps/api/src/routes/backends.ts
import { Hono } from 'hono';
import { loadBackendsCatalog } from '@/lib/backends-catalog';

export function buildBackendsRouter(deps: { backendCredentialsRepo: BackendCredentialsRepo; backendSettingsRepo: BackendSettingsRepo }) {
  const r = new Hono();
  const catalog = loadBackendsCatalog();

  r.get('/', (c) => {
    const statuses = new Map(deps.backendCredentialsRepo.listStatuses().map((s) => [s.backendId, s]));
    const active = deps.backendSettingsRepo.get('active_backend_id') ?? catalog.backends[0]?.id ?? null;
    return c.json({
      active_backend_id: active,
      backends: catalog.backends.map((b) => {
        const s = statuses.get(b.id);
        return {
          id: b.id,
          name: b.name,
          description: b.description,
          logo: b.logo,
          status: s?.status ?? 'not_configured',
          last_tested_at: s?.lastTestedAt ?? null,
          auth_schema: b.auth_schema, // safe — schema only, no values
        };
      }),
    });
  });

  return r;
}
```

- [ ] **Step 3: Register router** in `server.ts`: `app.route('/api/backends', buildBackendsRouter({ ... }))`.

- [ ] **Step 4: PASS + Commit**

```bash
git add apps/api/src/routes/backends.ts apps/api/src/server.ts apps/api/tests/routes/backends.test.ts
git commit -m "feat(api): GET /api/backends with status (spec 0071 Phase E)"
```

### Task E.2 — `POST /api/backends/:id/credentials` (paste-token path)

**Files:**
- Modify: `apps/api/src/routes/backends.ts`
- Create: `apps/api/src/lib/claude-test.ts`
- Test: extend `apps/api/tests/routes/backends.test.ts`

- [ ] **Step 1: Implement the test runner**

```ts
// apps/api/src/lib/claude-test.ts
export type TestResult =
  | { kind: 'ok' }
  | { kind: 'unauthorized' }
  | { kind: 'rate_limited'; retryAfterSec?: number }
  | { kind: 'network'; reason: string };

export async function testClaudeToken(opts: { token: string; model: string }): Promise<TestResult> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': opts.token,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: opts.model, max_tokens: 1, messages: [{ role: 'user', content: '1' }] }),
    });
    if (res.status === 401) return { kind: 'unauthorized' };
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') ?? '');
      return { kind: 'rate_limited', retryAfterSec: Number.isFinite(retry) ? retry : undefined };
    }
    if (res.status >= 500) return { kind: 'network', reason: `anthropic ${res.status}` };
    if (!res.ok) return { kind: 'network', reason: `unexpected ${res.status}` };
    return { kind: 'ok' };
  } catch (err) {
    return { kind: 'network', reason: String((err as Error).message ?? err) };
  }
}
```

- [ ] **Step 2: Add the route**

```ts
r.post('/:id/credentials', async (c) => {
  const id = c.req.param('id');
  const backend = catalog.backends.find((b) => b.id === id);
  if (!backend) return c.json({ error: 'unknown_backend' }, 404);
  const body = await c.req.json<{ token: string }>().catch(() => ({} as any));
  const token = body?.token;
  if (typeof token !== 'string' || !token) return c.json({ error: 'missing_token' }, 400);
  const regex = new RegExp(backend.auth_schema[0].regex ?? '.+');
  if (!regex.test(token)) return c.json({ error: 'invalid_format', hint: backend.auth_schema[0].regex_hint }, 400);

  const result = await testClaudeToken({ token, model: backend.test.model });
  if (result.kind === 'unauthorized') return c.json({ error: 'unauthorized' }, 401);
  if (result.kind === 'rate_limited') return c.json({ error: 'rate_limited', retryAfterSec: result.retryAfterSec }, 429);
  // network or ok → save (network = save with status='untested')
  deps.backendCredentialsRepo.upsert({ backendId: id, fieldName: 'oauth_token', value: token });
  const status = result.kind === 'ok' ? 'active' : 'untested';
  deps.backendCredentialsRepo.setStatus(id, status, Date.now());
  return c.json({ ok: true, status });
});
```

- [ ] **Step 3: Tests** for INVALID_FORMAT / UNAUTHORIZED / RATE_LIMITED / NETWORK (mock `fetch`).

- [ ] **Step 4: PASS + Commit**

```bash
git add apps/api/src/lib/claude-test.ts apps/api/src/routes/backends.ts apps/api/tests/lib/claude-test.test.ts apps/api/tests/routes/backends.test.ts
git commit -m "feat(api): paste-token endpoint with classifier (spec 0071 Phase E)"
```

### Task E.3 — OAuth-flow session registry

**Files:**
- Create: `apps/api/src/lib/oauth-sessions.ts`
- Test: `apps/api/tests/lib/oauth-sessions.test.ts`

- [ ] **Step 1: Failing test** — registry start/stop/timeout.

- [ ] **Step 2: Implement**

```ts
// apps/api/src/lib/oauth-sessions.ts
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

export type OAuthEvent =
  | { type: 'device_code_url'; url: string }
  | { type: 'status'; text: string }
  | { type: 'token_captured' }
  | { type: 'error'; kind: 'cli' | 'unauthorized' | 'rate_limited' | 'network'; message: string }
  | { type: 'success' };

export interface OAuthSession {
  id: string;
  emitter: EventEmitter;
  cancel(): void;
  /** populated only after a successful `token_captured` event */
  capturedToken: string | null;
}

export interface OAuthRegistryOpts {
  command: string[];
  urlRegex: RegExp;
  tokenRegex: RegExp;
  timeoutMs?: number; // default 5min
}

export class OAuthRegistry {
  private sessions = new Map<string, OAuthSession & { child: ChildProcessWithoutNullStreams; timer: NodeJS.Timeout }>();

  start(opts: OAuthRegistryOpts): OAuthSession {
    const id = randomUUID();
    const emitter = new EventEmitter();
    const [cmd, ...args] = opts.command;
    const child = spawn(cmd!, args, { env: { ...process.env, FORCE_COLOR: '0' } });
    const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
    const timer = setTimeout(() => {
      emitter.emit('event', { type: 'error', kind: 'cli', message: 'OAuth flow timed out (5 min)' });
      child.kill('SIGTERM');
    }, timeoutMs);

    let buffer = '';
    let urlEmitted = false;
    let token: string | null = null;

    const onChunk = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      if (!urlEmitted) {
        const m = buffer.match(opts.urlRegex);
        if (m && m[1]) { urlEmitted = true; emitter.emit('event', { type: 'device_code_url', url: m[1] } satisfies OAuthEvent); }
      }
      const t = buffer.match(opts.tokenRegex);
      if (t && t[1] && !token) {
        token = t[1];
        session.capturedToken = token;
        emitter.emit('event', { type: 'token_captured' } satisfies OAuthEvent);
      }
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);

    child.on('exit', (code) => {
      clearTimeout(timer);
      // Wipe stdin/stdout buffers
      buffer = '';
      if (!token) {
        emitter.emit('event', { type: 'error', kind: 'cli', message: `claude setup-token exited ${code}` } satisfies OAuthEvent);
      }
      this.sessions.delete(id);
    });

    const session: OAuthSession & { child: ChildProcessWithoutNullStreams; timer: NodeJS.Timeout } = {
      id, emitter, capturedToken: null, child, timer,
      cancel: () => { clearTimeout(timer); child.kill('SIGTERM'); },
    };
    this.sessions.set(id, session);
    return session;
  }

  get(id: string): OAuthSession | null { return this.sessions.get(id) ?? null; }
}
```

- [ ] **Step 3: PASS + Commit**

```bash
git add apps/api/src/lib/oauth-sessions.ts apps/api/tests/lib/oauth-sessions.test.ts
git commit -m "feat(api): OAuth session registry with 5-minute timeout (spec 0071 Phase E)"
```

### Task E.4 — `POST /api/backends/:id/oauth/start` + SSE stream

**Files:**
- Modify: `apps/api/src/routes/backends.ts`
- Test: `apps/api/tests/routes/backends-oauth.test.ts`

- [ ] **Step 1: Failing test** — start an OAuth session, simulate the registry emitting events, assert SSE delivers them.

- [ ] **Step 2: Implement**

```ts
const oauthRegistry = new OAuthRegistry();

r.post('/:id/oauth/start', (c) => {
  const id = c.req.param('id');
  const backend = catalog.backends.find((b) => b.id === id);
  if (!backend) return c.json({ error: 'unknown_backend' }, 404);
  const sess = oauthRegistry.start({
    command: backend.auto_flow.command,
    urlRegex: new RegExp(backend.auto_flow.stdout_url_regex),
    tokenRegex: new RegExp(backend.auto_flow.stdout_token_regex),
  });
  return c.json({ session_id: sess.id });
});

r.get('/:id/oauth/:session/stream', (c) => {
  const sess = oauthRegistry.get(c.req.param('session'));
  if (!sess) return c.text('session not found', 404);
  const stream = new ReadableStream({
    start(controller) {
      const onEvent = async (ev: OAuthEvent) => {
        controller.enqueue(`data: ${JSON.stringify(ev)}\n\n`);
        if (ev.type === 'token_captured') {
          // verify + persist + emit success/error
          const token = sess.capturedToken!;
          const result = await testClaudeToken({ token, model: backend.test.model });
          if (result.kind === 'ok') {
            deps.backendCredentialsRepo.upsert({ backendId: id, fieldName: 'oauth_token', value: token });
            deps.backendCredentialsRepo.setStatus(id, 'active', Date.now());
            controller.enqueue(`data: ${JSON.stringify({ type: 'success' })}\n\n`);
          } else if (result.kind === 'unauthorized') {
            controller.enqueue(`data: ${JSON.stringify({ type: 'error', kind: 'unauthorized', message: 'Anthropic rejected the token' })}\n\n`);
          } else if (result.kind === 'rate_limited') {
            controller.enqueue(`data: ${JSON.stringify({ type: 'error', kind: 'rate_limited', message: 'Anthropic throttled', retryAfterSec: result.retryAfterSec })}\n\n`);
          } else {
            // network: persist as untested
            deps.backendCredentialsRepo.upsert({ backendId: id, fieldName: 'oauth_token', value: token });
            deps.backendCredentialsRepo.setStatus(id, 'untested', Date.now());
            controller.enqueue(`data: ${JSON.stringify({ type: 'error', kind: 'network', message: result.reason })}\n\n`);
          }
          controller.close();
          sess.emitter.removeListener('event', onEvent);
        }
        if (ev.type === 'error') {
          controller.enqueue(`data: ${JSON.stringify(ev)}\n\n`);
          controller.close();
          sess.emitter.removeListener('event', onEvent);
        }
      };
      sess.emitter.on('event', onEvent);
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } });
});

r.post('/:id/oauth/:session/cancel', (c) => {
  const sess = oauthRegistry.get(c.req.param('session'));
  if (sess) sess.cancel();
  return c.json({ ok: true });
});
```

- [ ] **Step 3: PASS + Commit**

```bash
git add apps/api/src/routes/backends.ts apps/api/tests/routes/backends-oauth.test.ts
git commit -m "feat(api): OAuth start + SSE stream + cancel (spec 0071 Phase E)"
```

### Task E.5 — `PUT /api/backends/active`

**Files:**
- Modify: `apps/api/src/routes/backends.ts`

- [ ] **Step 1: Implement**

```ts
r.put('/active', async (c) => {
  const { backend_id } = await c.req.json<{ backend_id: string }>();
  if (!catalog.backends.some((b) => b.id === backend_id)) return c.json({ error: 'unknown_backend' }, 400);
  deps.backendSettingsRepo.set('active_backend_id', backend_id);
  return c.json({ ok: true });
});
```

- [ ] **Step 2: Test + Commit**

## Phase F — Dashboard: settings/backend redesign

(Tasks F.1–F.7 implement the components per Paper artboards. Each task = one component file + one test file + one commit. Reference Paper IDs in comments where ambiguity might arise.)

### Task F.1 — `<BackendCard />` component

**Files:**
- Create: `apps/dashboard/src/components/backend/backend-card.tsx`
- Test: `apps/dashboard/tests/components/backend/backend-card.test.tsx`

- [ ] **Step 1**: Build per Paper artboards `0071 · /settings/backend (default | claude expired | not configured)`. Props: `{ backend: BackendDto; onConfigure: () => void; onReauth: () => void }`. Status pill colors per spec (`active` jade `#6bd3a3`, `expired`/`failed` carmine `#e8617a`, `not_configured`/`untested` gold `#d9b362`).

- [ ] **Step 2**: Render the card meta row (`last_tested`, `storage`, `scope`) per the Paper default-state artboard. For `not_configured`, the meta values are `never` / `no credentials yet` / `profile · default`.

- [ ] **Step 3**: Test renders all three status variants with the correct pill color.

- [ ] **Step 4**: Commit.

### Task F.2 — `<ActiveBackendSelector />` component

**Files:**
- Create: `apps/dashboard/src/components/backend/active-selector.tsx`

- [ ] Build per Paper. Radio with one option (`claude-code`), text right side (`SELECTED · USED FOR CHAT + CRONS` when configured, `AWAITING CREDENTIALS · CLICK CONFIGURE TO START` when not).

### Task F.3 — `<OAuthLinkCard />` component

**Files:**
- Create: `apps/dashboard/src/components/backend/oauth-link-card.tsx`

- [ ] Build per Paper "waiting oauth" state. Props: `{ url: string; expiresInSec?: number; onCancel?: () => void }`. Cobalt border, "OPEN ↗" button (target="_blank"), spinner + "LISTENING FOR TOKEN FROM ANTHROPIC" status, optional cancel.

### Task F.4 — `<PasteTokenForm />` component

**Files:**
- Create: `apps/dashboard/src/components/backend/paste-token-form.tsx`

- [ ] Form with single password field + helper showing the regex hint + "Save & Test" button. Client-side regex check before submit. Inline error rendering per the four classifications.

### Task F.5 — `<ConfigureModal />` (9 states)

**Files:**
- Create: `apps/dashboard/src/components/backend/configure-modal.tsx`
- Create: `apps/dashboard/src/hooks/use-oauth-session.ts`
- Test: `apps/dashboard/tests/components/backend/configure-modal.test.tsx`

- [ ] **Step 1**: Implement `useOAuthSession` hook — wraps `EventSource`, exposes `{ start, cancel, state, deviceCodeUrl, error }`.

- [ ] **Step 2**: Modal renders the 4 auto-flow states + 4 error variants per Paper artboards (1827, 18H7, 18HS, 18ID, 1837, 1847, 1857, 1867). State machine:

```
idle → (click Connect Claude) → POST /oauth/start → waiting → (SSE token_captured) → verifying → (SSE success) → done
                                                          → (SSE error/cli|401|429|network) → error variant
                                                  → (cancel) → idle
idle → (click "paste manually") → paste-form → (submit) → verifying → (server response) → done | error variant
```

- [ ] **Step 3**: Tests cover every state transition. Use a mocked `EventSource` in jsdom.

- [ ] **Step 4**: Commit per state-machine batch.

### Task F.6 — Wire backend tab in `settings.tsx`

**Files:**
- Modify: `apps/dashboard/src/routes/_authed/settings.tsx`

- [ ] Replace existing `<BackendSection>` with `<ActiveBackendSelector>` + `<BackendCard>` list (1 entry today). Click handlers open `<ConfigureModal>`. Add a `<ComingSoonHint>` strip per Paper "CODEX · GEMINI · FUTURE BACKENDS".

### Task F.7 — Sidebar status dot

**Files:**
- Create: `apps/dashboard/src/components/sidebar/status-dot.tsx`
- Modify: `apps/dashboard/src/routes/_authed/layout.tsx` (or wherever sidebar is composed)

- [ ] 8×8 dot next to brand mark. Polls `useBackends()` (30s). Green when active backend `status === 'active'`. Red on `expired`/`failed`. Tooltip `Claude · <status>`. Click red → routes to `/settings/backend?reauth=claude-code` which auto-opens the modal.

## Phase G — Onboarding hero

### Task G.1 — Route `/onboarding/connect-claude`

**Files:**
- Create: `apps/dashboard/src/routes/onboarding/connect-claude.tsx`

- [ ] Build per Paper `0071 · /onboarding/connect-claude (idle|waiting oauth|verifying|done)`. No sidebar, no topstrip — single hero on `canvas`. Reuses `<OAuthLinkCard>`, `<PasteTokenForm>`. State machine identical to modal but full-page.

### Task G.2 — Root redirect logic

**Files:**
- Modify: `apps/dashboard/src/routes/__root.tsx` or `_authed/layout.tsx`

- [ ] Read `useBackends()` on mount. If no backend has `status !== 'not_configured'`, redirect to `/onboarding/connect-claude`. Once configured, `/onboarding/connect-claude` reverse-redirects to `/settings/backend`.

### Task G.3 — Tests

- [ ] State coverage in `apps/dashboard/tests/routes/onboarding-connect-claude.test.tsx`.

## Phase H — Re-auth flow

### Task H.1 — Worker emits Slack DM on `auth_expired` with 24h debounce

**Files:**
- Modify: `apps/worker/src/agent/core.ts` (or wherever `classifyError` consumer lives)
- Modify: `apps/worker/src/channels/slack/...`

- [ ] On `auth_expired`:
  - `repo.setStatus('claude-code', 'expired', null)`
  - If `now - last_auth_alert_at > 24h`: post DM to operator (`USER.md.slack_user_id`); set `last_auth_alert_at = now`.
  - Always reply in the originating thread/channel.

### Task H.2 — Tests

- [ ] Cover: first failure → DM sent + thread reply; second failure within 24h → thread reply only.

## Phase I — Migration + docs + ops

### Task I.1 — Update `.env.example`

**Files:**
- Modify: `profiles/default/.env.example`

- [ ] Remove `CLAUDE_CODE_OAUTH_TOKEN`. Add:

```
# Encryption key for credentials in the DB. 32 bytes, hex-encoded.
# Generate with:  openssl rand -hex 32
# CRITICAL: BACKUP THIS KEY OFFLINE. Losing it makes every encrypted credential
# (Slack tokens, GitHub PAT via connectors, Claude OAuth) unrecoverable.
ZENO_MASTER_KEY=REPLACE_ME
```

### Task I.2 — Legacy env import

**Files:**
- Modify: `apps/worker/src/index.ts`

- [ ] At boot, after migrations, before health checks: if `cfg.claude.legacyOauthToken` is set AND `repo.getValue('claude-code', 'oauth_token')` is null, call `repo.upsert(...)` once and log `claude_token_imported_from_env_legacy`. The dashboard surfaces a one-time banner via a flag in `backend_settings` (`legacy_env_import = '1'`).

### Task I.3 — `pnpm run docker:setup` master-key generator

**Files:**
- Modify: `infra/docker.sh`
- Modify: `package.json`

- [ ] Add a `setup` subcommand to `infra/docker.sh` that:
  - Reads `profiles/${PROFILE}/.env` (default profile if unset)
  - If `ZENO_MASTER_KEY` is missing or empty, append a new `openssl rand -hex 32` value
  - Print `BACKED UP THIS KEY OFFLINE — losing it bricks all encrypted DB rows`
  - NEVER overwrite an existing value
- [ ] Add `"docker:setup": "sh infra/docker.sh setup"` to `package.json` scripts.

### Task I.4 — Update `vault/rules/integration-tokens-in-db-only.md`

- [ ] Remove the bullet `Claude OAuth token (CLAUDE_CODE_OAUTH_TOKEN) — credencial de boot do AgentBackend. Não é tool surface do agent.` from §"O que continua válido em `.env`".
- [ ] Add a paragraph below: `**Spec 0071** retired this exception — Claude OAuth token now lives in DB-encrypted form via `backend_credentials`, materialized to `~/.claude/.credentials.json` at boot and on credential change. The agent reads via the SDK file-cache path, never via `process.env`.`

### Task I.5 — README setup section

**Files:**
- Modify: `README.md`

- [ ] Replace step 4 ("Claude OAuth token") with: `4. Generate the encryption key: `pnpm run docker:setup` (writes ZENO_MASTER_KEY into your .env — back it up offline).`
- [ ] After `pnpm run docker:up` step, add: `5. Open http://localhost:3000 → password gate → onboarding hero appears → click "Connect Claude" → complete OAuth → done.`
- [ ] Drop the old `pnpm run docker:setup-token` step.

## Phase J — Verification

### Task J.1 — Quality gate

```bash
pnpm run quality-gate
```

- [ ] All green. Fix any red before proceeding.

### Task J.2 — Docker boot test

- [ ] `pnpm run docker:build && pnpm run docker:up`. Tail logs. Expect:
  - `claude_cli_ok`
  - `claude_backend_unconfigured` (first boot, fresh profile) OR `claude_backend_configured` (existing profile post-legacy-import)
  - `slack_connected`
  - `zeno_online`

### Task J.3 — E2E in Slack channel C0EXAMPLE000

- [ ] **S1 fresh boot — no token**: in `https://acme.slack.com/archives/C0EXAMPLE000`, `@zeno hello` → expect "Claude is not configured. Open the dashboard…"
- [ ] **S1 onboarding auto-flow**: open dashboard → onboarding hero → click Connect Claude → complete OAuth at claude.ai → done state appears → `@zeno hello` → bot replies normally.
- [ ] **S1.alt paste fallback**: revoke the token (corrupt the row in DB), open Configure modal → toggle paste fallback → paste a fresh token → done → `@zeno` works.
- [ ] **S2 expires mid-use**: corrupt the encrypted row, `@zeno hello` → bot replies "Claude auth expired" + DM lands in operator's DM channel.
- [ ] **S3 bad-paste classifications**: 4 manual paste attempts in the modal — empty string (INVALID_FORMAT inline before submit), bogus token (UNAUTHORIZED via Anthropic), block outbound network (NETWORK).
- [ ] All scenarios pass with the expected UI state + Slack reply text.

### Task J.4 — 3-round clean review (per cleanup contract)

- [ ] **Round 1 — integration**: walk every UI state in the dashboard, every API endpoint via curl, every worker boot path. Find any inconsistency → fix → reset.
- [ ] **Round 2 — code quality**: review every changed file for dead code, missing types, biome-ignore drift, missing tests. Fix → reset.
- [ ] **Round 3 — fresh look**: `git diff main..HEAD --stat` + walk the diff cold. Anything that surprises you fixes a comment or simplifies a branch. Fix → reset.
- [ ] Three rounds with zero findings = ready to PR.

### Task J.5 — Open PR via `/open-pr`

- [ ] Push branch (NOT to main): `git push -u origin feat/spec-2026-05-03-backend-auth-dashboard`.
- [ ] Run `/open-pr` (project skill). PR title: `feat: backend auth via dashboard (spec 0071)`. Body auto-generated from commits + spec link.
- [ ] **Notify owner only when PR is open and 3-round review passed.**
