import { describe, expect, it } from 'vitest';
import { buildGraph } from '@/lib/build-graph';

describe('buildGraph', () => {
  it('returns empty arrays for empty input', () => {
    const out = buildGraph([]);
    expect(out).toEqual({ nodes: [], links: [], groups: [] });
  });

  it('returns one orphan node, no links, one group for a single file', () => {
    const out = buildGraph([
      { path: 'foo.md', body: '# Foo\n', frontmatter: null },
    ]);
    expect(out.nodes).toHaveLength(1);
    expect(out.nodes[0]).toMatchObject({
      id: 'foo.md',
      label: 'Foo',
      group: '',
      size: 0,
      tags: [],
      exists: true,
      isMeta: false,
    });
    expect(out.links).toEqual([]);
    expect(out.groups).toEqual([{ group: '', color: '#d9b362' }]);
  });

  it('emits a single undirected link for mutual references', () => {
    const out = buildGraph([
      { path: 'a.md', body: 'see [[b]]', frontmatter: null },
      { path: 'b.md', body: 'see [[a]]', frontmatter: null },
    ]);
    expect(out.links).toEqual([{ source: 'a.md', target: 'b.md' }]);
    expect(out.nodes.find((n) => n.id === 'a.md')?.size).toBe(1);
    expect(out.nodes.find((n) => n.id === 'b.md')?.size).toBe(1);
  });

  it('emits a ghost node for an unresolved slug', () => {
    const out = buildGraph([
      { path: 'd.md', body: 'see [[nope]]', frontmatter: null },
    ]);
    const ghost = out.nodes.find((n) => n.id === '?ghost:nope');
    expect(ghost).toMatchObject({
      id: '?ghost:nope',
      label: 'nope',
      group: '?ghost',
      size: 1,
      exists: false,
      isMeta: false,
    });
    expect(out.links).toContainEqual({ source: '?ghost:nope', target: 'd.md' });
    expect(out.groups).toContainEqual({ group: '?ghost', color: '#4b4f66' });
  });

  it('drops self-links', () => {
    const out = buildGraph([
      { path: 'a.md', body: 'see [[a]] and [[b]]', frontmatter: null },
      { path: 'b.md', body: '# B', frontmatter: null },
    ]);
    expect(out.links).toEqual([{ source: 'a.md', target: 'b.md' }]);
    expect(out.nodes.find((n) => n.id === 'a.md')?.size).toBe(1);
  });

  it('5th folder + ghost both map to the gray fallback color', () => {
    const files = ['alpha', 'bravo', 'charlie', 'delta', 'echo'].map((dir) => ({
      path: `${dir}/x.md`,
      body: 'see [[oops]]',
      frontmatter: null,
    }));
    const out = buildGraph(files);
    const groups = Object.fromEntries(out.groups.map((g) => [g.group, g.color]));
    expect(groups).toMatchObject({
      alpha: '#d9b362',
      bravo: '#6bd3a3',
      charlie: '#e8617a',
      delta: '#7aa6e8',
      echo: '#4b4f66',
      '?ghost': '#4b4f66',
    });
  });

  it('marks _index.md and _-prefixed subdir contents as meta', () => {
    const out = buildGraph([
      { path: '_index.md', body: '# Index', frontmatter: null },
      { path: '_drafts/wip.md', body: '# Wip', frontmatter: null },
      { path: 'foo.md', body: '# Foo', frontmatter: null },
    ]);
    expect(out.nodes.find((n) => n.id === '_index.md')?.isMeta).toBe(true);
    expect(out.nodes.find((n) => n.id === '_drafts/wip.md')?.isMeta).toBe(true);
    expect(out.nodes.find((n) => n.id === 'foo.md')?.isMeta).toBe(false);
  });

  it('derives group from the top-level folder for nested files', () => {
    const out = buildGraph([
      { path: 'processes/release.md', body: '', frontmatter: null },
      { path: 'processes/onboarding.md', body: '', frontmatter: null },
      { path: 'playbooks/security.md', body: '', frontmatter: null },
    ]);
    expect(out.nodes.find((n) => n.id === 'processes/release.md')?.group).toBe('processes');
    expect(out.nodes.find((n) => n.id === 'playbooks/security.md')?.group).toBe('playbooks');
  });

  it('reads tags from frontmatter', () => {
    const out = buildGraph([
      {
        path: 'a.md',
        body: '# A',
        frontmatter: { tags: ['security', 'audit'] },
      },
    ]);
    expect(out.nodes[0]?.tags).toEqual(['security', 'audit']);
  });
});
