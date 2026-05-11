import { describe, expect, it } from 'vitest';
import {
  assertBackendImplemented,
  isBackendImplemented,
  listSelectableBackends,
} from '../../src/lib/backend-resolver.js';

const FAKE_CATALOG = {
  backends: [
    {
      id: 'claude-code',
      name: 'Claude Code',
      description: 'Anthropic Claude',
    },
    {
      id: 'codex',
      name: 'Codex',
      description: 'OpenAI Codex',
    },
  ],
} as never;

describe('listSelectableBackends', () => {
  it('marks claude-code as implemented', () => {
    const items = listSelectableBackends(FAKE_CATALOG);
    expect(items.find((i) => i.id === 'claude-code')?.implemented).toBe(true);
  });

  it('marks codex as not implemented', () => {
    const items = listSelectableBackends(FAKE_CATALOG);
    expect(items.find((i) => i.id === 'codex')?.implemented).toBe(false);
  });
});

describe('isBackendImplemented', () => {
  it('returns true only for claude-code today', () => {
    expect(isBackendImplemented('claude-code')).toBe(true);
    expect(isBackendImplemented('codex')).toBe(false);
    expect(isBackendImplemented('gemini')).toBe(false);
  });
});

describe('assertBackendImplemented', () => {
  it('throws for unimplemented backends', () => {
    expect(() => assertBackendImplemented('codex')).toThrowError(
      /codex backend not implemented yet/,
    );
  });

  it('does not throw for claude-code', () => {
    expect(() => assertBackendImplemented('claude-code')).not.toThrow();
  });
});
