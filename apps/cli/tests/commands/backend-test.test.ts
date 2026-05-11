import { describe, expect, it } from 'vitest';
import { mapTestResultToExit, mapTestResultToStatus } from '../../src/commands/backend-test.js';

describe('mapTestResultToExit', () => {
  it.each([
    [{ kind: 'ok' }, 0],
    [{ kind: 'unauthorized' }, 1],
    [{ kind: 'rate_limited' }, 1],
    [{ kind: 'network', reason: 'ECONNREFUSED' }, 2],
  ] as const)('maps %j → exit %i', (result, code) => {
    expect(mapTestResultToExit(result as never)).toBe(code);
  });
});

describe('mapTestResultToStatus', () => {
  it.each([
    [{ kind: 'ok' }, 'active'],
    [{ kind: 'unauthorized' }, 'expired'],
    [{ kind: 'rate_limited' }, 'untested'],
    [{ kind: 'network', reason: 'x' }, 'untested'],
  ] as const)('maps %j → %s', (result, status) => {
    expect(mapTestResultToStatus(result as never)).toBe(status);
  });
});
