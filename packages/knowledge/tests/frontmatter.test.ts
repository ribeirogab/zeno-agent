import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../src/frontmatter.js';

describe('parseFrontmatter', () => {
  it('returns null frontmatter when none is present', () => {
    const out = parseFrontmatter('# Heading\n\nBody only.\n');
    expect(out.frontmatter).toBeNull();
    expect(out.body).toBe('# Heading\n\nBody only.\n');
  });

  it('extracts fields from a well-formed frontmatter block', () => {
    const raw = `---
title: Release flow
description: How code goes to prod
tags: [process, deploy]
related: [stack, ci-cd]
---

# Release flow

Body here.
`;
    const out = parseFrontmatter(raw);
    expect(out.frontmatter).toEqual({
      title: 'Release flow',
      description: 'How code goes to prod',
      tags: ['process', 'deploy'],
      related: ['stack', 'ci-cd'],
    });
    expect(out.body).toBe('# Release flow\n\nBody here.\n');
  });

  it('returns null frontmatter and the full original body when YAML is malformed', () => {
    const raw = `---
title: : broken : :
tags: [unterminated
---

body
`;
    const out = parseFrontmatter(raw);
    expect(out.frontmatter).toBeNull();
    expect(out.body).toBe(raw);
  });

  it('omits missing fields', () => {
    const raw = `---
title: Just a title
---

body
`;
    const out = parseFrontmatter(raw);
    expect(out.frontmatter).toEqual({ title: 'Just a title' });
  });
});
