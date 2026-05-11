import { describe, expect, it } from 'vitest';
import { editOnGithub } from './edit-on-github';

describe('editOnGithub', () => {
  it('returns owner/repo/sha/path for a top-level mdx', () => {
    expect(editOnGithub('install.mdx')).toEqual({
      owner: 'ribeirogab',
      repo: 'zeno-agent',
      sha: 'main',
      path: 'apps/docs/content/docs/install.mdx',
    });
  });

  it('handles nested mdx paths', () => {
    expect(editOnGithub('guides/quickstart.mdx')).toEqual({
      owner: 'ribeirogab',
      repo: 'zeno-agent',
      sha: 'main',
      path: 'apps/docs/content/docs/guides/quickstart.mdx',
    });
  });

  it('strips a leading slash if present', () => {
    expect(editOnGithub('/install.mdx').path).toBe('apps/docs/content/docs/install.mdx');
  });
});
