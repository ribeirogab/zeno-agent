import { describe, expect, it, vi } from 'vitest';
import { runConnectorSecretList } from '@/commands/connector-secret-list.js';
import { runConnectorSecretReveal } from '@/commands/connector-secret-reveal.js';
import { runConnectorSecretRotate } from '@/commands/connector-secret-rotate.js';
import { runConnectorSecretSet } from '@/commands/connector-secret-set.js';

describe('zeno connector secret', () => {
  describe('list', () => {
    it('GETs the connector and prints one masked line per secret', async () => {
      const client = {
        get: vi.fn().mockResolvedValue({
          id: 'abc',
          secrets: [
            { key: 'LINEAR_API_KEY', masked: true, last4: '1234' },
            { key: 'SENTRY_DSN', masked: true, last4: 'abcd' },
          ],
        }),
        patch: vi.fn(),
      };
      const out: string[] = [];
      await runConnectorSecretList(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { target: 'linear-acme' },
        (line) => out.push(line),
      );
      expect(client.get).toHaveBeenCalledWith('/api/connectors/linear-acme');
      expect(out).toHaveLength(2);
      expect(out[0]).toMatch(/LINEAR_API_KEY/);
      expect(out[0]).toMatch(/1234/);
      expect(out[0]).toMatch(/●/);
      expect(out[1]).toMatch(/SENTRY_DSN/);
      expect(out[1]).toMatch(/abcd/);
    });

    it('prints nothing when the connector has no secrets', async () => {
      const client = {
        get: vi.fn().mockResolvedValue({ id: 'abc', secrets: [] }),
        patch: vi.fn(),
      };
      const out: string[] = [];
      await runConnectorSecretList(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { target: 'custom-1' },
        (line) => out.push(line),
      );
      expect(out).toHaveLength(0);
    });
  });

  describe('set', () => {
    it('prompts for the value and PATCHes /api/connectors/<id> with secrets', async () => {
      const client = {
        get: vi
          .fn()
          // First: connector lookup.
          .mockResolvedValueOnce({ id: 'abc' })
          // Second+: command-status polls.
          .mockResolvedValue({ status: 'success', result: null }),
        patch: vi.fn().mockResolvedValue({ correlationId: 'corr-9' }),
      };
      const prompter = vi.fn().mockResolvedValue('new-secret-value');
      const out: string[] = [];
      await runConnectorSecretSet(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { target: 'linear-acme', key: 'LINEAR_API_KEY', prompter },
        (line) => out.push(line),
      );
      expect(client.get).toHaveBeenNthCalledWith(1, '/api/connectors/linear-acme');
      expect(prompter).toHaveBeenCalledTimes(1);
      expect(client.patch).toHaveBeenCalledWith('/api/connectors/abc', {
        secrets: [{ key: 'LINEAR_API_KEY', value: 'new-secret-value' }],
      });
      expect(client.get).toHaveBeenCalledWith('/api/commands/corr-9');
      const text = out.join('\n');
      expect(text).toContain('corr-9');
      expect(text).toMatch(/LINEAR_API_KEY/);
    });

    it('rejects an empty value from the prompter', async () => {
      const client = {
        get: vi.fn().mockResolvedValue({ id: 'abc' }),
        patch: vi.fn(),
      };
      const prompter = vi.fn().mockResolvedValue('');
      await expect(
        runConnectorSecretSet(
          // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
          client as any,
          { target: 'linear-acme', key: 'LINEAR_API_KEY', prompter },
          () => {},
        ),
      ).rejects.toThrow(/empty/i);
      expect(client.patch).not.toHaveBeenCalled();
    });

    it('throws when waitForCommand reports failure', async () => {
      const client = {
        get: vi
          .fn()
          .mockResolvedValueOnce({ id: 'abc' })
          .mockResolvedValue({ status: 'failed', result: 'bad_secret' }),
        patch: vi.fn().mockResolvedValue({ correlationId: 'corr-fail' }),
      };
      const prompter = vi.fn().mockResolvedValue('value');
      await expect(
        runConnectorSecretSet(
          // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
          client as any,
          { target: 'linear-acme', key: 'LINEAR_API_KEY', prompter },
          () => {},
        ),
      ).rejects.toThrow(/secret set failed: bad_secret/);
    });
  });

  describe('rotate', () => {
    it('walks catalog required secrets, prompts each, and PATCHes one payload', async () => {
      const client = {
        get: vi
          .fn()
          // 1. connector lookup
          .mockResolvedValueOnce({ id: 'abc', catalogId: 'linear' })
          // 2. catalog list
          .mockResolvedValueOnce([
            {
              id: 'linear',
              secrets: [
                { key: 'LINEAR_API_KEY', required: true, label: 'Linear API key' },
                { key: 'LINEAR_HINT', required: false, label: 'Optional hint' },
              ],
            },
          ])
          // 3+. command-status polls
          .mockResolvedValue({ status: 'success', result: null }),
        patch: vi.fn().mockResolvedValue({ correlationId: 'corr-r' }),
      };
      const prompter = vi.fn().mockResolvedValue('rotated-key');
      const out: string[] = [];
      await runConnectorSecretRotate(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { target: 'linear-acme', prompter },
        (line) => out.push(line),
      );
      expect(client.get).toHaveBeenNthCalledWith(1, '/api/connectors/linear-acme');
      expect(client.get).toHaveBeenNthCalledWith(2, '/api/connectors/catalog');
      // Only required secrets are prompted.
      expect(prompter).toHaveBeenCalledTimes(1);
      expect(client.patch).toHaveBeenCalledWith('/api/connectors/abc', {
        secrets: [{ key: 'LINEAR_API_KEY', value: 'rotated-key' }],
      });
      expect(client.get).toHaveBeenCalledWith('/api/commands/corr-r');
      const text = out.join('\n');
      expect(text).toContain('corr-r');
      expect(text).toMatch(/rotated/i);
    });

    it('refuses to rotate a custom connector (no catalogId)', async () => {
      const client = {
        get: vi.fn().mockResolvedValue({ id: 'abc', catalogId: null }),
        patch: vi.fn(),
      };
      const prompter = vi.fn();
      await expect(
        runConnectorSecretRotate(
          // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
          client as any,
          { target: 'custom-1', prompter },
          () => {},
        ),
      ).rejects.toThrow(/custom connectors/i);
      expect(prompter).not.toHaveBeenCalled();
      expect(client.patch).not.toHaveBeenCalled();
    });

    it('throws when the catalog entry is missing', async () => {
      const client = {
        get: vi
          .fn()
          .mockResolvedValueOnce({ id: 'abc', catalogId: 'gone' })
          .mockResolvedValueOnce([{ id: 'other', secrets: [] }]),
        patch: vi.fn(),
      };
      const prompter = vi.fn();
      await expect(
        runConnectorSecretRotate(
          // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
          client as any,
          { target: 'gone-acme', prompter },
          () => {},
        ),
      ).rejects.toThrow(/catalog entry "gone" not found/);
      expect(client.patch).not.toHaveBeenCalled();
    });

    it('throws when the catalog entry has no required secrets', async () => {
      const client = {
        get: vi
          .fn()
          .mockResolvedValueOnce({ id: 'abc', catalogId: 'noop' })
          .mockResolvedValueOnce([{ id: 'noop', secrets: [] }]),
        patch: vi.fn(),
      };
      const prompter = vi.fn();
      await expect(
        runConnectorSecretRotate(
          // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
          client as any,
          { target: 'noop-acme', prompter },
          () => {},
        ),
      ).rejects.toThrow(/no required secrets/i);
      expect(prompter).not.toHaveBeenCalled();
      expect(client.patch).not.toHaveBeenCalled();
    });
  });

  describe('reveal', () => {
    it('GETs the reveal endpoint and prints the value', async () => {
      const client = {
        get: vi
          .fn()
          // 1. connector lookup → resolve id
          .mockResolvedValueOnce({ id: 'abc' })
          // 2. reveal payload
          .mockResolvedValueOnce({ value: 'plain-secret-value' }),
      };
      const out: string[] = [];
      await runConnectorSecretReveal(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { target: 'linear-acme', key: 'LINEAR_API_KEY' },
        (line) => out.push(line),
      );
      expect(client.get).toHaveBeenNthCalledWith(1, '/api/connectors/linear-acme');
      expect(client.get).toHaveBeenNthCalledWith(
        2,
        '/api/connectors/abc/secrets/LINEAR_API_KEY/reveal',
      );
      expect(out).toContain('plain-secret-value');
    });

    it('surfaces a 429 rate-limit with retryAfter as a friendly error', async () => {
      const error = Object.assign(new Error('GET /api/connectors/abc/secrets/X/reveal -> 429'), {
        status: 429,
        body: { error: 'rate_limited', retryAfter: 42 },
      });
      const client = {
        get: vi.fn().mockResolvedValueOnce({ id: 'abc' }).mockRejectedValueOnce(error),
      };
      await expect(
        runConnectorSecretReveal(
          // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
          client as any,
          { target: 'linear-acme', key: 'LINEAR_API_KEY' },
          () => {},
        ),
      ).rejects.toThrow(/rate.?limited.*42/i);
    });

    it('rethrows non-429 errors unchanged', async () => {
      const error = Object.assign(new Error('GET /api/connectors/abc/secrets/X/reveal -> 500'), {
        status: 500,
        body: { error: 'boom' },
      });
      const client = {
        get: vi.fn().mockResolvedValueOnce({ id: 'abc' }).mockRejectedValueOnce(error),
      };
      await expect(
        runConnectorSecretReveal(
          // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
          client as any,
          { target: 'linear-acme', key: 'LINEAR_API_KEY' },
          () => {},
        ),
      ).rejects.toThrow(/500/);
    });
  });
});
