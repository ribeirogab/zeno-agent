import { describe, expect, it } from 'vitest';
import { _resetBackendsCatalogCache, loadBackendsCatalog } from '../src/catalog.js';

describe('loadBackendsCatalog', () => {
  it('reads the on-disk catalog and validates the schema', () => {
    _resetBackendsCatalogCache();
    const cat = loadBackendsCatalog();
    expect(cat.backends.length).toBeGreaterThanOrEqual(1);
    const claude = cat.backends.find((b) => b.id === 'claude-code');
    expect(claude).toBeDefined();
    expect(claude?.auth_schema[0]?.field).toBe('oauth_token');
    expect(claude?.auto_flow.command).toEqual(['claude', 'setup-token']);
    expect(claude?.test.kind).toBe('claude-handshake');
  });

  it('caches by mtime — repeated reads return the same object', () => {
    _resetBackendsCatalogCache();
    const a = loadBackendsCatalog();
    const b = loadBackendsCatalog();
    expect(a).toBe(b);
  });
});
