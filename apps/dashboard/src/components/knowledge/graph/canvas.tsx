import { forceCollide, forceX, forceY } from 'd3-force';
import { type JSX, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { GraphLink, GraphNode, GroupColor } from './types';

interface CanvasProps {
  nodes: GraphNode[];
  links: GraphLink[];
  groups: GroupColor[];
  selectedId: string | undefined;
  onNodeClick: (id: string) => void;
}

interface SimNode extends GraphNode {
  x?: number;
  y?: number;
}

interface SimLink {
  source: string | SimNode;
  target: string | SimNode;
}

const ACCENT = '#a276ff';
const TAG_COLOR = '#e8a87c';
const NODE_BASE = 1.6;
const NODE_SCALE = 0.55;
const LABEL_ZOOM = 3.5;

const radiusFor = (degree: number): number =>
  NODE_BASE + Math.sqrt(Math.max(0, degree)) * NODE_SCALE;

export function Canvas({
  nodes,
  links,
  groups,
  selectedId,
  onNodeClick,
}: CanvasProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<{
    d3Force: (name: string, force?: unknown) => unknown;
  } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  const groupColor = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) m.set(g.group, g.color);
    return m;
  }, [groups]);

  const neighborMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of links) {
      if (!m.has(l.source)) m.set(l.source, new Set());
      if (!m.has(l.target)) m.set(l.target, new Set());
      m.get(l.source)?.add(l.target);
      m.get(l.target)?.add(l.source);
    }
    return m;
  }, [links]);

  // Stable graphData ref — force-graph reheats sim when this object identity changes.
  // Recompute only when actual data (nodes/links arrays) changes, NOT on hover/selection.
  const graphData = useMemo(() => ({ nodes, links }), [nodes, links]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Configure forces once the ref is wired up
  useEffect(() => {
    const fg = fgRef.current as {
      d3Force: (
        name: string,
        force?: unknown,
      ) =>
        | {
            strength?: (n: number) => unknown;
            distance?: (n: number | ((l: SimLink) => number)) => unknown;
            distanceMax?: (n: number) => unknown;
          }
        | undefined;
    } | null;
    if (!fg) return;
    const charge = fg.d3Force('charge') as
      | { strength: (n: number) => { distanceMax: (n: number) => unknown } }
      | undefined;
    charge?.strength(-400).distanceMax(700);
    const link = fg.d3Force('link') as
      | {
          distance: (n: (l: SimLink) => number) => { strength: (n: number) => unknown };
        }
      | undefined;
    link
      ?.distance((l) => {
        const sKind = typeof l.source === 'object' ? l.source.kind : 'file';
        const tKind = typeof l.target === 'object' ? l.target.kind : 'file';
        if (sKind === 'tag' || tKind === 'tag') return 32;
        return 70;
      })
      .strength(0.45);
    const center = fg.d3Force('center') as { strength: (n: number) => unknown } | undefined;
    center?.strength(0.008);
    fg.d3Force('x', forceX<SimNode>(0).strength(0.008));
    fg.d3Force('y', forceY<SimNode>(0).strength(0.008));
    fg.d3Force(
      'collide',
      forceCollide<SimNode>()
        .radius((n) => radiusFor(n.size) + 6)
        .strength(0.9)
        .iterations(2),
    );
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full" style={{ backgroundColor: '#08090F' }}>
      <ForceGraph2D
        ref={fgRef as never}
        graphData={graphData}
        width={size.width}
        height={size.height}
        backgroundColor="#08090F"
        cooldownTicks={Number.POSITIVE_INFINITY}
        d3AlphaDecay={0.025}
        d3AlphaMin={0}
        d3VelocityDecay={0.72}
        warmupTicks={80}
        onNodeHover={(n: object | null) => {
          setHoverId(n === null ? null : (n as SimNode).id);
        }}
        onNodeClick={(n: object) => onNodeClick((n as SimNode).id)}
        linkColor={(l: object) => {
          const link = l as SimLink;
          const sId = typeof link.source === 'string' ? link.source : link.source.id;
          const tId = typeof link.target === 'string' ? link.target : link.target.id;
          if (hoverId !== null && (sId === hoverId || tId === hoverId)) {
            return 'rgba(162, 118, 255, 0.9)';
          }
          return hoverId === null ? 'rgba(180, 190, 210, 0.18)' : 'rgba(180, 190, 210, 0.05)';
        }}
        linkWidth={(l: object) => {
          const link = l as SimLink;
          const sId = typeof link.source === 'string' ? link.source : link.source.id;
          const tId = typeof link.target === 'string' ? link.target : link.target.id;
          return hoverId !== null && (sId === hoverId || tId === hoverId) ? 1.5 : 0.6;
        }}
        nodeCanvasObject={(rawNode: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const node = rawNode as SimNode;
          if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
          const x = node.x ?? 0;
          const y = node.y ?? 0;
          const radius = radiusFor(node.size);
          const isHovered = node.id === hoverId;
          const isSelected = node.id === selectedId;
          const isNeighbor =
            hoverId !== null && !isHovered && (neighborMap.get(hoverId)?.has(node.id) ?? false);
          const isFocus = hoverId === null || isHovered || isNeighbor;

          ctx.globalAlpha = isFocus ? 1 : 0.18;

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
          if (node.kind === 'tag') {
            ctx.fillStyle = TAG_COLOR;
            ctx.fill();
          } else if (node.exists) {
            ctx.fillStyle = '#c8cee0';
            ctx.fill();
          } else {
            ctx.strokeStyle = 'rgba(200, 206, 224, 0.55)';
            ctx.lineWidth = 1;
            ctx.stroke();
          }

          if (isSelected) {
            ctx.strokeStyle = ACCENT;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(x, y, radius + 1.5, 0, 2 * Math.PI, false);
            ctx.stroke();
          }

          if (isHovered || isNeighbor || globalScale >= LABEL_ZOOM) {
            const fontPx = isHovered ? 12 / globalScale : 10 / globalScale;
            ctx.font = `${fontPx}px ui-monospace, monospace`;
            ctx.fillStyle = isHovered
              ? 'rgba(232, 234, 245, 1)'
              : isNeighbor
                ? 'rgba(220, 226, 240, 0.9)'
                : 'rgba(200, 206, 224, 0.7)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(node.label, x, y + radius + 2);
          }
          ctx.globalAlpha = 1;
        }}
        nodePointerAreaPaint={(rawNode: object, color: string, ctx: CanvasRenderingContext2D) => {
          const node = rawNode as SimNode;
          if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
          const r = Math.max(6, radiusFor(node.size) * 2.5);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI, false);
          ctx.fill();
        }}
      />
    </div>
  );
}
