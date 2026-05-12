import { afterEach, describe, expect, it } from 'vitest';
import {
  _resetChannelsCatalogCache,
  findChannelCatalogEntry,
  loadChannelsCatalog,
} from '../../src/lib/channels-catalog-loader';

describe('channels-catalog-loader (spec 0057)', () => {
  afterEach(() => {
    _resetChannelsCatalogCache();
  });

  it('loadChannelsCatalog parses and returns at least one channel', () => {
    const catalog = loadChannelsCatalog();
    expect(catalog.entries.length).toBeGreaterThan(0);
  });

  it('catalog has Slack entry with required fields and public flag (spec 2026-05-11)', () => {
    const catalog = loadChannelsCatalog();
    const slack = catalog.entries.find((e) => e.id === 'slack');
    expect(slack).toBeDefined();
    expect(slack?.name).toBe('Slack');
    expect(slack?.slug).toBe('slack');
    expect(slack?.icon).toBe('slack.svg');
    expect(slack?.testStrategy).toBe('slack_auth_test');
    expect(slack?.transport).toBe('socket-mode');
    expect(slack?.fields.length).toBeGreaterThanOrEqual(2);
    const keys = slack?.fields.map((f) => f.key) ?? [];
    expect(keys).toContain('SLACK_APP_TOKEN');
    expect(keys).toContain('SLACK_BOT_TOKEN');
    const appToken = slack?.fields.find((f) => f.key === 'SLACK_APP_TOKEN');
    expect(appToken).toMatchObject({ required: true, public: false });
  });

  it('findChannelCatalogEntry returns Slack by id', () => {
    const catalog = loadChannelsCatalog();
    const slack = findChannelCatalogEntry(catalog, 'slack');
    expect(slack?.slug).toBe('slack');
  });

  it('findChannelCatalogEntry returns null for unknown id', () => {
    const catalog = loadChannelsCatalog();
    const result = findChannelCatalogEntry(catalog, 'discord');
    expect(result).toBeNull();
  });

  it('findField returns field metadata for a known key (spec 2026-05-11)', () => {
    const catalog = loadChannelsCatalog();
    const field = catalog.findField('slack', 'SLACK_BOT_TOKEN');
    expect(field).toMatchObject({ required: true, public: false });
  });

  it('findField returns undefined for unknown catalog or unknown key', () => {
    const catalog = loadChannelsCatalog();
    expect(catalog.findField('slack', 'NOPE')).toBeUndefined();
    expect(catalog.findField('nope', 'SLACK_BOT_TOKEN')).toBeUndefined();
  });

  it('caches by mtime — second call returns same instance', () => {
    const a = loadChannelsCatalog();
    const b = loadChannelsCatalog();
    expect(a).toBe(b); // identity check — cache hit
  });
});
