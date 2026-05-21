import { describe, expect, it } from 'vitest';
import { extractTitle } from '../src/title.js';

describe('extractTitle', () => {
  it('returns frontmatter.title when present', () => {
    expect(
      extractTitle({
        frontmatter: { title: 'From frontmatter' },
        body: '# From heading\n\nbody',
        relPath: 'about-me.md',
      }),
    ).toBe('From frontmatter');
  });

  it('falls back to the first H1 when frontmatter.title is missing', () => {
    expect(
      extractTitle({
        frontmatter: null,
        body: 'leading line\n\n# Real heading\n\nbody',
        relPath: 'about-me.md',
      }),
    ).toBe('Real heading');
  });

  it('falls back to the filename without extension when nothing else is available', () => {
    expect(
      extractTitle({
        frontmatter: null,
        body: 'no heading at all\n',
        relPath: 'engineering/release-flow.md',
      }),
    ).toBe('release-flow');
  });
});
