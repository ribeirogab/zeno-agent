import { describe, expect, it } from 'vitest';
import { extractDescription } from '../src/description.js';

describe('extractDescription', () => {
  it('returns frontmatter.description when present', () => {
    expect(
      extractDescription({
        frontmatter: { description: 'From frontmatter' },
        body: 'first paragraph in body',
      }),
    ).toBe('From frontmatter');
  });

  it('falls back to the first non-heading paragraph in the body', () => {
    expect(
      extractDescription({
        frontmatter: null,
        body: '# A heading\n\nThis is the first paragraph.\n\nSecond paragraph.',
      }),
    ).toBe('This is the first paragraph.');
  });

  it('truncates the body fallback to 120 chars with an ellipsis', () => {
    const long = 'x'.repeat(200);
    expect(extractDescription({ frontmatter: null, body: long })).toBe(`${'x'.repeat(120)}…`);
  });

  it('returns an empty string when no paragraph is available', () => {
    expect(extractDescription({ frontmatter: null, body: '# Heading\n\n## Subheading\n' })).toBe('');
  });
});
