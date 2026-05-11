import { describe, expect, it } from 'vitest';
import { formatBackendDetail } from '../../src/commands/backend-show.js';

describe('formatBackendDetail', () => {
  it('renders status, scope, last test', () => {
    const out = formatBackendDetail({
      id: 'claude-code',
      name: 'Claude Code',
      status: 'active',
      lastTestedAt: 1700000000000,
      scope: 'profile · aes-256-gcm',
    });
    expect(out).toContain('claude-code');
    expect(out).toContain('active');
    expect(out).toContain('profile · aes-256-gcm');
    expect(out).toContain('2023-11-14T22:13:20.000Z');
  });

  it('renders never for null lastTestedAt', () => {
    const out = formatBackendDetail({
      id: 'codex',
      name: 'Codex',
      status: 'not_configured',
      lastTestedAt: null,
      scope: 'profile · aes-256-gcm',
    });
    expect(out).toContain('never');
  });
});
