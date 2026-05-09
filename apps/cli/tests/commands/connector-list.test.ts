import { describe, expect, it, vi } from 'vitest';
import { runConnectorList } from '@/commands/connector-list.js';

describe('zeno connector list', () => {
  it('prints a table of connectors and groups', async () => {
    const client = {
      get: vi.fn().mockResolvedValue([
        {
          kind: 'connector',
          slug: 'sentry',
          displayName: 'Sentry',
          instanceLabel: null,
          status: 'enabled',
        },
        {
          kind: 'connector_group',
          catalogId: 'linear',
          name: 'Linear',
          installationCount: 3,
          installations: [
            { slug: 'linear-acme', instanceLabel: 'Acme', status: 'enabled' },
            { slug: 'linear-personal', instanceLabel: 'Personal', status: 'enabled' },
            { slug: 'linear-side', instanceLabel: 'Side-project', status: 'disabled' },
          ],
        },
      ]),
    };
    const out: string[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to Pick<ApiClient, 'get'>
    await runConnectorList(client as any, { profile: 'default', json: false }, (line) =>
      out.push(line),
    );
    const text = out.join('\n');
    expect(text).toContain('sentry');
    expect(text).toContain('linear');
    expect(text).toContain('linear-acme');
    expect(text).toContain('Acme');
  });

  it('emits raw JSON when --json is set', async () => {
    const client = {
      get: vi.fn().mockResolvedValue([{ kind: 'connector', slug: 'sentry' }]),
    };
    const out: string[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to Pick<ApiClient, 'get'>
    await runConnectorList(client as any, { profile: 'default', json: true }, (l) => out.push(l));
    expect(JSON.parse(out.join('\n'))).toEqual([{ kind: 'connector', slug: 'sentry' }]);
  });
});
