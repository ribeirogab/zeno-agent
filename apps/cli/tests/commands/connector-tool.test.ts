import { describe, expect, it, vi } from 'vitest';
import { runConnectorToolBulk } from '@/commands/connector-tool-bulk.js';
import { runConnectorToolList } from '@/commands/connector-tool-list.js';
import { runConnectorToolSet } from '@/commands/connector-tool-set.js';

describe('zeno connector tool', () => {
  describe('list', () => {
    it('GETs the connector and prints one line per tool', async () => {
      const client = {
        get: vi.fn().mockResolvedValue({
          id: 'abc',
          tools: [
            { toolName: 'get_issue', category: 'read', permission: 'always_allow' },
            { toolName: 'create_issue', category: 'write', permission: 'ask' },
          ],
        }),
        patch: vi.fn(),
      };
      const out: string[] = [];
      await runConnectorToolList(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { target: 'linear-acme' },
        (line) => out.push(line),
      );
      expect(client.get).toHaveBeenCalledWith('/api/connectors/linear-acme');
      expect(out).toHaveLength(2);
      expect(out[0]).toMatch(/get_issue/);
      expect(out[0]).toMatch(/read/);
      expect(out[0]).toMatch(/always_allow/);
      expect(out[1]).toMatch(/create_issue/);
      expect(out[1]).toMatch(/write/);
      expect(out[1]).toMatch(/ask/);
    });
  });

  describe('set', () => {
    it('PATCHes the per-tool permission endpoint', async () => {
      const client = {
        get: vi.fn().mockResolvedValue({ id: 'abc' }),
        patch: vi.fn().mockResolvedValue(undefined),
      };
      const out: string[] = [];
      await runConnectorToolSet(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { target: 'linear-acme', tool: 'create_issue', permission: 'always_allow' },
        (line) => out.push(line),
      );
      expect(client.get).toHaveBeenCalledWith('/api/connectors/linear-acme');
      expect(client.patch).toHaveBeenCalledWith(
        '/api/connectors/abc/tools/create_issue/permission',
        { permission: 'always_allow' },
      );
      expect(out.join('\n')).toMatch(/create_issue/);
      expect(out.join('\n')).toMatch(/always_allow/);
    });

    it('rejects invalid permission values', async () => {
      const client = {
        get: vi.fn(),
        patch: vi.fn(),
      };
      await expect(
        runConnectorToolSet(
          // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
          client as any,
          { target: 'linear-acme', tool: 'create_issue', permission: 'bogus' },
          () => {},
        ),
      ).rejects.toThrow(/permission must be always_allow\|ask\|never/);
      expect(client.get).not.toHaveBeenCalled();
      expect(client.patch).not.toHaveBeenCalled();
    });
  });

  describe('bulk', () => {
    it('PATCHes the bulk permission endpoint and prints rowsAffected', async () => {
      const client = {
        get: vi.fn().mockResolvedValue({ id: 'abc' }),
        patch: vi.fn().mockResolvedValue({ rowsAffected: 7 }),
      };
      const out: string[] = [];
      await runConnectorToolBulk(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { target: 'linear-acme', category: 'read', permission: 'always_allow' },
        (line) => out.push(line),
      );
      expect(client.get).toHaveBeenCalledWith('/api/connectors/linear-acme');
      expect(client.patch).toHaveBeenCalledWith('/api/connectors/abc/tools/permissions/bulk', {
        category: 'read',
        permission: 'always_allow',
      });
      const text = out.join('\n');
      expect(text).toMatch(/7/);
      expect(text).toMatch(/read/);
      expect(text).toMatch(/always_allow/);
    });

    it('rejects invalid category', async () => {
      const client = { get: vi.fn(), patch: vi.fn() };
      await expect(
        runConnectorToolBulk(
          // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
          client as any,
          { target: 'linear-acme', category: 'bogus', permission: 'always_allow' },
          () => {},
        ),
      ).rejects.toThrow(/category must be read\|write\|interactive/);
      expect(client.get).not.toHaveBeenCalled();
      expect(client.patch).not.toHaveBeenCalled();
    });

    it('rejects invalid permission', async () => {
      const client = { get: vi.fn(), patch: vi.fn() };
      await expect(
        runConnectorToolBulk(
          // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
          client as any,
          { target: 'linear-acme', category: 'read', permission: 'bogus' },
          () => {},
        ),
      ).rejects.toThrow(/permission must be always_allow\|ask\|never/);
      expect(client.get).not.toHaveBeenCalled();
      expect(client.patch).not.toHaveBeenCalled();
    });
  });
});
