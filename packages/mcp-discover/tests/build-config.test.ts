import type { Connector } from '@zeno/db/runtime';
import { describe, expect, it } from 'vitest';
import {
  RESERVED_AUTHORIZATION_KEY,
  RESERVED_MCP_TYPE_KEY,
  toRemoteConfig,
  toStdioConfig,
} from '../src/build-config';

function baseConnector(overrides: Partial<Connector> = {}): Connector {
  return {
    id: 'i',
    slug: 's',
    displayName: 'S',
    description: null,
    source: 'custom',
    catalogId: null,
    transport: 'stdio',
    command: 'cmd',
    args: null,
    url: null,
    status: 'enabled',
    lastError: null,
    lastErrorAt: null,
    lastVerifiedAt: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('toStdioConfig', () => {
  it('builds env from secrets', () => {
    const c = toStdioConfig(baseConnector({ command: 'node', args: ['x.js'] }), [
      { connectorId: 'i', key: 'API_KEY', value: 'k' },
      { connectorId: 'i', key: RESERVED_AUTHORIZATION_KEY, value: 'Bearer t' },
      { connectorId: 'i', key: RESERVED_MCP_TYPE_KEY, value: 'http' },
    ]);
    expect(c.env).toEqual({ API_KEY: 'k', AUTHORIZATION: 'Bearer t' });
  });

  it('omits env when no secrets', () => {
    const c = toStdioConfig(baseConnector(), []);
    expect(c).not.toHaveProperty('env');
  });

  it('throws when no command', () => {
    expect(() => toStdioConfig(baseConnector({ command: null }), [])).toThrow(/no command/);
  });
});

describe('toRemoteConfig', () => {
  it('picks sse for /sse', () => {
    expect(
      toRemoteConfig(baseConnector({ transport: 'remote', url: 'https://x/sse' }), []).type,
    ).toBe('sse');
    expect(
      toRemoteConfig(baseConnector({ transport: 'remote', url: 'https://x/sse/' }), []).type,
    ).toBe('sse');
  });

  it('picks http for non-sse paths', () => {
    expect(
      toRemoteConfig(baseConnector({ transport: 'remote', url: 'https://x/mcp' }), []).type,
    ).toBe('http');
  });

  it('respects __MCP_TYPE__ override', () => {
    expect(
      toRemoteConfig(baseConnector({ transport: 'remote', url: 'https://x/sse' }), [
        { connectorId: 'i', key: RESERVED_MCP_TYPE_KEY, value: 'http' },
      ]).type,
    ).toBe('http');
  });

  it('routes __MCP_AUTHORIZATION__ to Authorization header', () => {
    const c = toRemoteConfig(baseConnector({ transport: 'remote', url: 'https://x' }), [
      { connectorId: 'i', key: RESERVED_AUTHORIZATION_KEY, value: 'Bearer abc' },
    ]);
    expect(c.headers).toEqual({ Authorization: 'Bearer abc' });
  });

  it('throws when no url', () => {
    expect(() => toRemoteConfig(baseConnector({ transport: 'remote', url: null }), [])).toThrow(
      /no url/,
    );
  });
});
