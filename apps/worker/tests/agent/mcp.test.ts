import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadMcpConfig } from '@/agent/mcp';

const ORIGINAL_CWD = process.cwd();
const ORIGINAL_ENV = process.env;

let workDir: string;

beforeEach(() => {
  workDir = join(tmpdir(), `zeno-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(workDir, 'profile'), { recursive: true });
  process.chdir(workDir);
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  process.env = ORIGINAL_ENV;
  rmSync(workDir, { recursive: true, force: true });
});

function writeMcp(content: object): void {
  writeFileSync(join(workDir, 'profile', 'mcp.json'), JSON.stringify(content));
}

describe('loadMcpConfig', () => {
  it('returns empty object when profile/mcp.json does not exist', () => {
    const result = loadMcpConfig();
    expect(result).toEqual({});
  });

  it('loads servers without env vars', () => {
    writeMcp({
      mcpServers: {
        playwright: { command: 'npx', args: ['-y', '@playwright/mcp@latest'] },
      },
    });
    const result = loadMcpConfig();
    expect(result.playwright).toMatchObject({
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
    });
  });

  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal placeholder in test name
  it('interpolates ${VAR} from process.env', () => {
    process.env.LINEAR_API_KEY = 'lin_test_abc';
    writeMcp({
      mcpServers: {
        linear: {
          command: 'npx',
          args: ['-y', 'mcp-linear'],
          // biome-ignore lint/suspicious/noTemplateCurlyInString: literal env-var placeholder syntax tested by loadMcpConfig
          env: { LINEAR_API_KEY: '${LINEAR_API_KEY}' },
        },
      },
    });
    const result = loadMcpConfig();
    expect(result.linear?.env).toEqual({ LINEAR_API_KEY: 'lin_test_abc' });
  });

  it('skips servers with unresolved env vars', () => {
    delete process.env.LINEAR_API_KEY;
    writeMcp({
      mcpServers: {
        linear: {
          command: 'npx',
          args: [],
          // biome-ignore lint/suspicious/noTemplateCurlyInString: literal env-var placeholder syntax tested by loadMcpConfig
          env: { LINEAR_API_KEY: '${LINEAR_API_KEY}' },
        },
        playwright: { command: 'npx', args: ['-y', '@playwright/mcp@latest'] },
      },
    });
    const result = loadMcpConfig();
    expect(result.linear).toBeUndefined();
    expect(result.playwright).toBeDefined();
  });

  it('skips servers with _disabled: true', () => {
    writeMcp({
      mcpServers: {
        sentry: {
          _disabled: true,
          command: 'npx',
          args: ['-y', '@sentry/mcp-server'],
        },
      },
    });
    const result = loadMcpConfig();
    expect(result.sentry).toBeUndefined();
  });

  it('strips _comment, _disabled, _doc fields before returning', () => {
    writeMcp({
      _doc: 'doc string',
      mcpServers: {
        playwright: {
          _comment: 'a note',
          command: 'npx',
          args: ['-y', '@playwright/mcp@latest'],
        },
      },
    });
    const result = loadMcpConfig();
    expect(result.playwright).not.toHaveProperty('_comment');
    expect(result.playwright).not.toHaveProperty('_disabled');
  });

  it('returns empty when JSON is malformed', () => {
    writeFileSync(join(workDir, 'profile', 'mcp.json'), '{not valid json');
    const result = loadMcpConfig();
    expect(result).toEqual({});
  });

  it('treats empty string env vars as unresolved', () => {
    process.env.SOME_KEY = '';
    writeMcp({
      mcpServers: {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: literal env-var placeholder syntax tested by loadMcpConfig
        s: { command: 'x', env: { SOME_KEY: '${SOME_KEY}' } },
      },
    });
    const result = loadMcpConfig();
    expect(result.s).toBeUndefined();
  });
});
