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

  it('catalog has Slack entry with required secrets', () => {
    const catalog = loadChannelsCatalog();
    const slack = catalog.entries.find((e) => e.id === 'slack');
    expect(slack).toBeDefined();
    expect(slack?.name).toBe('Slack');
    expect(slack?.slug).toBe('slack');
    expect(slack?.icon).toBe('slack.svg');
    expect(slack?.secrets.length).toBeGreaterThanOrEqual(2);
    const keys = slack?.secrets.map((s) => s.key) ?? [];
    expect(keys).toContain('SLACK_APP_TOKEN');
    expect(keys).toContain('SLACK_BOT_TOKEN');
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

  it('caches by mtime — second call returns same instance', () => {
    const a = loadChannelsCatalog();
    const b = loadChannelsCatalog();
    expect(a).toBe(b); // identity check — cache hit
  });
});
