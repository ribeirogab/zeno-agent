import { describe, expect, it } from 'vitest';
import { resolveRelated } from '../src/related.js';

const PATHS = [
  'about-me.md',
  'engineering/stack.md',
  'engineering/services/api.md',
  'products/services/api.md',
  'processes/release-flow.md',
];

describe('resolveRelated', () => {
  it('resolves a bare slug to a single matching file', () => {
    const out = resolveRelated(PATHS, [{ file: 'processes/release-flow.md', slug: 'stack' }]);
    expect(out.resolved.get('processes/release-flow.md')?.get('stack')).toBe(
      'engineering/stack.md',
    );
    expect(out.unresolved).toEqual([]);
  });

  it('marks an unresolved slug when nothing matches', () => {
    const out = resolveRelated(PATHS, [
      { file: 'processes/release-flow.md', slug: 'no-such-thing' },
    ]);
    expect(out.unresolved).toEqual([
      { file: 'processes/release-flow.md', slug: 'no-such-thing' },
    ]);
    expect(out.resolved.get('processes/release-flow.md')).toBeUndefined();
  });

  it('marks ambiguous bare slugs as unresolved', () => {
    const out = resolveRelated(PATHS, [{ file: 'processes/release-flow.md', slug: 'api' }]);
    expect(out.unresolved).toEqual([{ file: 'processes/release-flow.md', slug: 'api' }]);
  });

  it('disambiguates with a path prefix', () => {
    const out = resolveRelated(PATHS, [
      { file: 'processes/release-flow.md', slug: 'engineering/api' },
    ]);
    expect(out.resolved.get('processes/release-flow.md')?.get('engineering/api')).toBe(
      'engineering/services/api.md',
    );
    expect(out.unresolved).toEqual([]);
  });
});
