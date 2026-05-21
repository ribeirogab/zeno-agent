import { describe, expect, it } from 'vitest';
import { extractWikilinks, resolveWikilinks } from '../src/wikilink.js';

describe('extractWikilinks', () => {
  it('returns empty array on body with no wikilinks', () => {
    expect(extractWikilinks('plain markdown body')).toEqual([]);
  });

  it('extracts a single bare slug', () => {
    expect(extractWikilinks('see [[other-note]] for details')).toEqual(['other-note']);
  });

  it('extracts multiple wikilinks in order, deduplicated', () => {
    const body = '[[alpha]] mentions [[beta]] and again [[alpha]] and finally [[gamma]]';
    expect(extractWikilinks(body)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('extracts dir-prefixed slugs', () => {
    expect(extractWikilinks('cf [[processes/release-flow]]')).toEqual(['processes/release-flow']);
  });

  it('ignores wikilinks inside fenced code blocks', () => {
    const body = '```\nsee [[ignored]]\n```\nbut [[kept]] is fine';
    expect(extractWikilinks(body)).toEqual(['kept']);
  });

  it('ignores wikilinks inside inline code', () => {
    const body = 'literal `[[ignored]]` then real [[kept]]';
    expect(extractWikilinks(body)).toEqual(['kept']);
  });

  it('skips empty wikilinks and whitespace-only', () => {
    expect(extractWikilinks('[[]] and [[   ]] then [[real]]')).toEqual(['real']);
  });

  it('trims whitespace inside the wikilink', () => {
    expect(extractWikilinks('[[ spaced-slug ]]')).toEqual(['spaced-slug']);
  });
});

describe('resolveWikilinks', () => {
  it('returns empty object on empty input', () => {
    expect(resolveWikilinks([], ['foo.md'])).toEqual({});
  });

  it('resolves a bare slug to a root-level file', () => {
    expect(resolveWikilinks(['foo'], ['foo.md', 'bar.md'])).toEqual({ foo: 'foo.md' });
  });

  it('resolves a bare slug to a file in a subfolder', () => {
    expect(resolveWikilinks(['release-flow'], ['processes/release-flow.md'])).toEqual({
      'release-flow': 'processes/release-flow.md',
    });
  });

  it('returns null when slug is ambiguous (multiple matches)', () => {
    expect(resolveWikilinks(['foo'], ['foo.md', 'sub/foo.md'])).toEqual({ foo: null });
  });

  it('resolves dir-prefixed slug exactly', () => {
    const out = resolveWikilinks(
      ['processes/release-flow'],
      ['processes/release-flow.md', 'other/release-flow.md'],
    );
    expect(out).toEqual({ 'processes/release-flow': 'processes/release-flow.md' });
  });

  it('returns null when slug has no match', () => {
    expect(resolveWikilinks(['ghost'], ['foo.md'])).toEqual({ ghost: null });
  });

  it('handles multiple slugs in one call', () => {
    const out = resolveWikilinks(['foo', 'ghost', 'bar'], ['foo.md', 'bar.md', 'sub/bar.md']);
    expect(out).toEqual({ foo: 'foo.md', ghost: null, bar: null });
  });
});
