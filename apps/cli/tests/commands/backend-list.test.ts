import { describe, expect, it } from 'vitest';
import { buildBackendRows } from '../../src/commands/backend-list.js';

const CATALOG = {
  backends: [
    { id: 'claude-code', name: 'Claude Code' },
    { id: 'codex', name: 'Codex' },
  ],
} as never;

describe('buildBackendRows', () => {
  it('joins catalog backends with credential statuses', () => {
    const rows = buildBackendRows(CATALOG, [
      {
        backendId: 'claude-code',
        status: 'active',
        lastTestedAt: 1700000000000,
        lastAuthAlertAt: null,
      },
    ]);
    expect(rows).toEqual([
      { id: 'claude-code', name: 'Claude Code', status: 'active', lastTestedAt: 1700000000000 },
      { id: 'codex', name: 'Codex', status: 'not_configured', lastTestedAt: null },
    ]);
  });

  it('marks every backend as not_configured when no statuses exist', () => {
    const rows = buildBackendRows(CATALOG, []);
    expect(rows.every((r) => r.status === 'not_configured')).toBe(true);
  });
});
