import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildKnowledgeRoute } from '@/routes/knowledge';

const FIXTURE = resolve(__dirname, '../../testdata/knowledge-graph');

describe('GET /api/knowledge/graph', () => {
  it('returns nodes, links, and groups for the fixture', async () => {
    const route = buildKnowledgeRoute({ knowledgeRoot: FIXTURE });
    const res = await route.request('/graph');
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.nodes.map((n: { id: string }) => n.id).sort();
    expect(ids).toEqual([
      '?ghost:ghost-note',
      '?tag:security',
      'a.md',
      'b.md',
      'c.md',
      'd.md',
      'processes/release.md',
    ]);
    expect(body.links).toEqual(
      expect.arrayContaining([
        { source: 'a.md', target: 'b.md' },
        { source: 'a.md', target: 'processes/release.md' },
        { source: '?ghost:ghost-note', target: 'd.md' },
        { source: '?tag:security', target: 'a.md' },
      ]),
    );
    expect(body.links).toHaveLength(4);
    expect(body.groups.find((g: { group: string }) => g.group === '?ghost')?.color).toBe('#4b4f66');
    expect(body.groups.find((g: { group: string }) => g.group === '?tag')?.color).toBe('#e8a87c');
  });

  it('returns empty arrays when the knowledge root does not exist', async () => {
    const route = buildKnowledgeRoute({ knowledgeRoot: '/definitely/does/not/exist' });
    const res = await route.request('/graph');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ nodes: [], links: [], groups: [] });
  });

  it('ignores ?path= query param', async () => {
    const route = buildKnowledgeRoute({ knowledgeRoot: FIXTURE });
    const res = await route.request('/graph?path=../../etc/passwd');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nodes.length).toBeGreaterThan(0);
  });
});
