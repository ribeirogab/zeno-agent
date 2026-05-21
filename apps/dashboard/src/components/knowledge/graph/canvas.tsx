import { type JSX, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { DisplayState, GraphLink, GraphNode, GroupColor } from './types';

interface CanvasProps {
  nodes: GraphNode[];
  links: GraphLink[];
  groups: GroupColor[];
  display: DisplayState;
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

export function Canvas({ nodes, links, groups, display, onNodeClick }: CanvasProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-w-0"
      style={{ backgroundColor: '#08090F' }}
    >
      <ForceGraph2D
        graphData={{ nodes, links }}
        width={size.width}
        height={size.height}
        backgroundColor="#08090F"
        cooldownTicks={50}
        onNodeClick={(n: object) => onNodeClick((n as SimNode).id)}
        onNodeHover={(n: object | null) => setHoverId(n === null ? null : (n as SimNode).id)}
        linkColor={() => 'rgba(148, 163, 184, 0.4)'}
        linkWidth={display.linkThickness}
        nodeCanvasObject={(rawNode: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const node = rawNode as SimNode;
          const x = node.x ?? 0;
          const y = node.y ?? 0;
          const isFocus =
            hoverId === null ||
            hoverId === node.id ||
            neighborMap.get(hoverId)?.has(node.id) === true;
          const opacity = isFocus ? 1 : 0.25;
          const radius = Math.max(0.5, node.size * display.nodeSize);
          const color = groupColor.get(node.group) ?? '#4b4f66';

          ctx.globalAlpha = opacity;
          ctx.beginPath();
          ctx.arc(x, y, radius * 2, 0, 2 * Math.PI, false);
          if (node.exists) {
            ctx.fillStyle = color;
            ctx.fill();
          } else {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          if (globalScale >= display.labelFadeZoom) {
            ctx.font = `${10 / globalScale}px ui-monospace, monospace`;
            ctx.fillStyle = 'rgba(232, 234, 245, 0.8)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(node.label, x, y + radius * 2 + 2);
          }
          ctx.globalAlpha = 1;
        }}
        linkCanvasObject={(rawLink: object, ctx: CanvasRenderingContext2D) => {
          const link = rawLink as SimLink;
          const source = link.source;
          const target = link.target;
          const sourceId = typeof source === 'string' ? source : source.id;
          const targetId = typeof target === 'string' ? target : target.id;
          const sx = typeof source === 'string' ? 0 : (source.x ?? 0);
          const sy = typeof source === 'string' ? 0 : (source.y ?? 0);
          const tx = typeof target === 'string' ? 0 : (target.x ?? 0);
          const ty = typeof target === 'string' ? 0 : (target.y ?? 0);
          const isIncident = hoverId === null || hoverId === sourceId || hoverId === targetId;
          const opacity = isIncident ? 0.5 : 0.1;
          ctx.globalAlpha = opacity;
          ctx.strokeStyle = 'rgb(148, 163, 184)';
          ctx.lineWidth = display.linkThickness;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(tx, ty);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }}
      />
    </div>
  );
}
