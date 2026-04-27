import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadApprovalsConfig } from '@/guardrails/config';

let workdir: string;
const originalCwd = process.cwd();

function writeYaml(content: string): void {
  writeFileSync(join(workdir, 'profile', 'config.yaml'), content, 'utf8');
}

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'zeno-guardrails-cfg-'));
  process.chdir(workdir);
  mkdirSync(join(workdir, 'profile'));
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(workdir, { recursive: true, force: true });
});

describe('loadApprovalsConfig', () => {
  it('parses a valid approvals section into a typed object', () => {
    // Spec 0048 Q5: always_sensitive removed from yaml — DB-managed via approval_rules.
    writeYaml(`
approvals:
  owner_slack_user_id: U0123ABCDEF
  approval_timeout_sec: 600
  classifier_model: claude-haiku-4-5
`);
    const config = loadApprovalsConfig();
    expect(config).not.toBeNull();
    expect(config?.owner_slack_user_id).toBe('U0123ABCDEF');
    expect(config?.approval_timeout_sec).toBe(600);
    expect(config?.classifier_model).toBe('claude-haiku-4-5');
  });

  it('hard-fails if yaml still has always_sensitive (spec 0048 Q5)', () => {
    writeYaml(`
approvals:
  owner_slack_user_id: U0123ABCDEF
  always_sensitive:
    - mcp__github__merge_pull_request
`);
    expect(() => loadApprovalsConfig()).toThrow(/always_sensitive.*no longer supported/);
  });

  it('returns null when the approvals section is missing', () => {
    writeYaml(`
crons:
  - name: morning-summary
    schedule: "0 9 * * *"
    prompt: hi
`);
    expect(loadApprovalsConfig()).toBeNull();
  });

  it('throws when owner_slack_user_id is invalid', () => {
    writeYaml(`
approvals:
  owner_slack_user_id: not-a-slack-id
`);
    expect(() => loadApprovalsConfig()).toThrow();
  });
});
