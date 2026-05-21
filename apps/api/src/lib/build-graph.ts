import { type Frontmatter, extractTitle, extractWikilinks, resolveWikilinks } from '@zeno/knowledge';
import type {
  GraphLink,
  GraphNode,
  GraphResponse,
  GroupColor,
} from '@/routes/knowledge';

export interface GraphInputFile {
  path: string;
  body: string;
  frontmatter: Frontmatter | null;
}

const PALETTE = [
  '#d9b362',
  '#6bd3a3',
  '#e8617a',
  '#7aa6e8',
] as const;
const FALLBACK_COLOR = '#4b4f66';
const GHOST_PREFIX = '?ghost:';
const GHOST_GROUP = '?ghost';

export function buildGraph(files: GraphInputFile[]): GraphResponse {
  if (files.length === 0) return { nodes: [], links: [], groups: [] };

  const allPaths = files.map((f) => f.path);

  const edges: Array<[string, string]> = [];
  for (const file of files) {
    const slugs = extractWikilinks(file.body);
    if (slugs.length === 0) continue;
    const resolved = resolveWikilinks(slugs, allPaths);
    for (const slug of slugs) {
      const target = resolved[slug];
      if (target === file.path) continue;
      if (target === null || target === undefined) {
        edges.push([file.path, `${GHOST_PREFIX}${slug}`]);
      } else {
        edges.push([file.path, target]);
      }
    }
  }

  const linkSet = new Set<string>();
  const links: GraphLink[] = [];
  for (const [a, b] of edges) {
    const [source, target] = a < b ? [a, b] : [b, a];
    const key = `${source} ${target}`;
    if (linkSet.has(key)) continue;
    linkSet.add(key);
    links.push({ source, target });
  }

  const degree = new Map<string, number>();
  for (const { source, target } of links) {
    degree.set(source, (degree.get(source) ?? 0) + 1);
    degree.set(target, (degree.get(target) ?? 0) + 1);
  }

  const realNodes: GraphNode[] = files.map((f) => ({
    id: f.path,
    label: extractTitle({ frontmatter: f.frontmatter, body: f.body, relPath: f.path }),
    group: derivedGroup(f.path),
    size: degree.get(f.path) ?? 0,
    tags: f.frontmatter?.tags ?? [],
    exists: true,
    isMeta: isMetaPath(f.path),
  }));

  const ghostIds = new Set<string>();
  for (const { source, target } of links) {
    if (source.startsWith(GHOST_PREFIX)) ghostIds.add(source);
    if (target.startsWith(GHOST_PREFIX)) ghostIds.add(target);
  }
  const ghostNodes: GraphNode[] = Array.from(ghostIds).map((id) => ({
    id,
    label: id.slice(GHOST_PREFIX.length),
    group: GHOST_GROUP,
    size: degree.get(id) ?? 0,
    tags: [],
    exists: false,
    isMeta: false,
  }));

  const nodes = [...realNodes, ...ghostNodes];

  const distinctGroups = Array.from(new Set(nodes.map((n) => n.group)));
  const sorted = distinctGroups
    .filter((g) => g !== GHOST_GROUP)
    .sort((a, b) => a.localeCompare(b));
  const groups: GroupColor[] = sorted.map((group, i) => ({
    group,
    color: i < PALETTE.length ? (PALETTE[i] ?? FALLBACK_COLOR) : FALLBACK_COLOR,
  }));
  if (distinctGroups.includes(GHOST_GROUP)) {
    groups.push({ group: GHOST_GROUP, color: FALLBACK_COLOR });
  }

  return { nodes, links, groups };
}

function derivedGroup(relPath: string): string {
  const parts = relPath.split('/');
  if (parts.length <= 1) return '';
  return parts[0] ?? '';
}

function isMetaPath(relPath: string): boolean {
  return relPath.split('/').some((part) => part.startsWith('_'));
}
