import { describe, expect, it } from 'vitest';
import { applyFilters } from './filter-graph';
import { DEFAULT_FILTER_STATE, type GraphResponse } from './types';

const raw: GraphResponse = {
  nodes: [
    { id: 'a.md', label: 'A', group: '', size: 1, tags: ['security'], exists: true, isMeta: false },
    { id: 'b.md', label: 'B', group: '', size: 1, tags: ['ops'], exists: true, isMeta: false },
    { id: 'orph.md', label: 'Orph', group: '', size: 0, tags: [], exists: true, isMeta: false },
    { id: '_index.md', label: 'Index', group: '', size: 0, tags: [], exists: true, isMeta: true },
    {
      id: '?ghost:nope',
      label: 'nope',
      group: '?ghost',
      size: 1,
      tags: [],
      exists: false,
      isMeta: false,
    },
    {
      id: 'processes/r.md',
      label: 'R',
      group: 'processes',
      size: 1,
      tags: ['ops'],
      exists: true,
      isMeta: false,
    },
  ],
  links: [
    { source: 'a.md', target: 'b.md' },
    { source: 'processes/r.md', target: '?ghost:nope' },
  ],
  groups: [],
};

describe('applyFilters', () => {
  it('passes everything through with defaults except meta + orphans-honored', () => {
    const out = applyFilters(raw, DEFAULT_FILTER_STATE);
    const ids = out.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(['?ghost:nope', 'a.md', 'b.md', 'orph.md', 'processes/r.md']);
    expect(out.links).toHaveLength(2);
  });

  it('hides meta files when showMeta=false (default)', () => {
    const out = applyFilters(raw, DEFAULT_FILTER_STATE);
    expect(out.nodes.some((n) => n.id === '_index.md')).toBe(false);
  });

  it('shows meta files when showMeta=true', () => {
    const out = applyFilters(raw, { ...DEFAULT_FILTER_STATE, showMeta: true });
    expect(out.nodes.some((n) => n.id === '_index.md')).toBe(true);
  });

  it('hides ghost nodes when existingOnly=true', () => {
    const out = applyFilters(raw, { ...DEFAULT_FILTER_STATE, existingOnly: true });
    expect(out.nodes.some((n) => n.id === '?ghost:nope')).toBe(false);
    expect(out.links).toEqual([{ source: 'a.md', target: 'b.md' }]);
  });

  it('hides nodes with size=0 when showOrphans=false', () => {
    const out = applyFilters(raw, { ...DEFAULT_FILTER_STATE, showOrphans: false });
    expect(out.nodes.some((n) => n.id === 'orph.md')).toBe(false);
    expect(out.nodes.some((n) => n.id === 'a.md')).toBe(true);
  });

  it('filters by case-insensitive label substring search', () => {
    const out = applyFilters(raw, { ...DEFAULT_FILTER_STATE, search: 'orp' });
    const ids = out.nodes.map((n) => n.id);
    expect(ids).toContain('orph.md');
    expect(ids).not.toContain('a.md');
  });

  it('filters by tag intersection', () => {
    const out = applyFilters(raw, { ...DEFAULT_FILTER_STATE, tags: ['ops'] });
    const ids = out.nodes.map((n) => n.id).sort();
    expect(ids).toContain('b.md');
    expect(ids).toContain('processes/r.md');
    expect(ids).not.toContain('a.md');
  });

  it('filters by folder membership (ghosts always pass)', () => {
    const out = applyFilters(raw, { ...DEFAULT_FILTER_STATE, folders: ['processes'] });
    expect(out.nodes.every((n) => n.group === 'processes' || n.id.startsWith('?ghost:'))).toBe(true);
  });

  it('drops links whose endpoints were filtered out', () => {
    const out = applyFilters(raw, { ...DEFAULT_FILTER_STATE, existingOnly: true });
    expect(
      out.links.every(
        (l) =>
          out.nodes.some((n) => n.id === l.source) && out.nodes.some((n) => n.id === l.target),
      ),
    ).toBe(true);
  });
});
