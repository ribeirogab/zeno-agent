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
    writeYaml(`
approvals:
  owner_slack_user_id: U0123ABCDEF
  always_sensitive:
    - mcp__github__merge_pull_request
    - "mcp__github__*"
  approval_timeout_sec: 600
  classifier_model: claude-haiku-4-5
`);
    const config = loadApprovalsConfig();
    expect(config).not.toBeNull();
    expect(config?.owner_slack_user_id).toBe('U0123ABCDEF');
    expect(config?.always_sensitive).toEqual(['mcp__github__merge_pull_request', 'mcp__github__*']);
    expect(config?.approval_timeout_sec).toBe(600);
    expect(config?.classifier_model).toBe('claude-haiku-4-5');
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
