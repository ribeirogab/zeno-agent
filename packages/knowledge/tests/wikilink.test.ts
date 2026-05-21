import { describe, expect, it } from 'vitest';
import { extractWikilinks } from '../src/wikilink.js';

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
