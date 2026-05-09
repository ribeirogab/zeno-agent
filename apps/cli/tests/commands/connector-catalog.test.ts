import { describe, expect, it, vi } from 'vitest';
import { runConnectorCatalog } from '@/commands/connector-catalog.js';

describe('zeno connector catalog', () => {
  it('GETs /api/connectors/catalog and prints id-name table', async () => {
    const client = {
      get: vi.fn().mockResolvedValue([
        {
          id: 'sentry',
          name: 'Sentry',
          description: 'Error tracking',
          isInstalled: true,
          toolCount: 5,
        },
        {
          id: 'linear',
          name: 'Linear',
          description: 'Issue tracking',
          isInstalled: false,
          toolCount: 12,
        },
      ]),
    };
    const out: string[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to Pick<ApiClient, 'get'>
    await runConnectorCatalog(client as any, { json: false }, (line) => out.push(line));
    expect(client.get).toHaveBeenCalledWith('/api/connectors/catalog');
    const text = out.join('\n');
    expect(text).toContain('sentry');
    expect(text).toContain('Sentry');
    expect(text).toContain('installed');
    expect(text).toContain('linear');
    expect(text).toContain('Linear');
    expect(text).toContain('available');
  });

  it('emits raw JSON when --json is set', async () => {
    const items = [
      {
        id: 'sentry',
        name: 'Sentry',
        description: 'Error tracking',
        isInstalled: true,
        toolCount: 5,
      },
    ];
    const client = { get: vi.fn().mockResolvedValue(items) };
    const out: string[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to Pick<ApiClient, 'get'>
    await runConnectorCatalog(client as any, { json: true }, (l) => out.push(l));
    expect(JSON.parse(out.join('\n'))).toEqual(items);
  });
});
