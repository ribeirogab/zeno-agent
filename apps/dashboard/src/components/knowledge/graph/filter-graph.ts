import type { FilterState, GraphResponse } from './types';

export function applyFilters(
  raw: GraphResponse,
  filters: FilterState,
): { nodes: GraphResponse['nodes']; links: GraphResponse['links'] } {
  const search = filters.search.trim().toLowerCase();
  const tagSet = new Set(filters.tags);
  const folderSet = new Set(filters.folders);

  const filteredNodes = raw.nodes.filter((n) => {
    if (!filters.showMeta && n.isMeta) return false;
    if (filters.existingOnly && !n.exists) return false;
    if (!filters.showOrphans && n.size === 0) return false;
    if (
      search.length > 0 &&
      !n.label.toLowerCase().includes(search) &&
      !n.id.toLowerCase().includes(search)
    ) {
      return false;
    }
    if (tagSet.size > 0) {
      const overlap = (n.tags ?? []).some((t) => tagSet.has(t));
      if (!overlap) return false;
    }
    if (folderSet.size > 0 && !folderSet.has(n.group) && !n.id.startsWith('?ghost:')) {
      return false;
    }
    return true;
  });

  const allowedIds = new Set(filteredNodes.map((n) => n.id));
  const filteredLinks = raw.links.filter(
    (l) => allowedIds.has(l.source) && allowedIds.has(l.target),
  );

  return { nodes: filteredNodes, links: filteredLinks };
}
