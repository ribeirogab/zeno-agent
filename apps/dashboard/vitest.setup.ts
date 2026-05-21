import { createElement } from 'react';
import { vi } from 'vitest';

vi.mock('react-force-graph-2d', () => {
  type ForceGraphProps = {
    graphData?: { nodes: Array<{ id?: string }>; links: unknown[] };
    onNodeClick?: (node: { id: string }) => void;
    onNodeHover?: (node: { id: string } | null) => void;
  };
  const ForceGraph2D = ({ graphData, onNodeClick, onNodeHover }: ForceGraphProps) => {
    const node = graphData?.nodes?.[0];
    const props = {
      'data-testid': 'force-graph-2d',
      'data-node-count': String(graphData?.nodes?.length ?? 0),
      'data-link-count': String(graphData?.links?.length ?? 0),
      onClick: () => onNodeClick?.({ id: node?.id ?? '' }),
      onMouseEnter: () => onNodeHover?.({ id: node?.id ?? '' }),
      onMouseLeave: () => onNodeHover?.(null),
    } as Record<string, unknown>;
    return createElement('div', props);
  };
  return { default: ForceGraph2D };
});
