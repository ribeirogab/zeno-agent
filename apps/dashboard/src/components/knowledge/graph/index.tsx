import type { JSX } from 'react';
import { Canvas } from './canvas';
import { useGraphData } from './use-graph-data';

interface GraphViewProps {
  selectedId: string | undefined;
  onNodeClick: (id: string) => void;
}

export default function GraphView({ selectedId, onNodeClick }: GraphViewProps): JSX.Element {
  const query = useGraphData();

  if (query.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-text-tertiary">
        Loading graph…
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-text-secondary">
        <span>
          Failed to load graph.{' '}
          <button type="button" onClick={() => query.refetch()} className="underline text-gold">
            Retry
          </button>
        </span>
      </div>
    );
  }
  if ((query.data?.nodes.length ?? 0) === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-text-secondary text-center">
        <p>
          No notes to graph. Add files under <code>~/.zeno/profiles/&lt;name&gt;/knowledge/</code>.
        </p>
      </div>
    );
  }

  return (
    <Canvas
      nodes={query.data?.nodes ?? []}
      links={query.data?.links ?? []}
      groups={query.data?.groups ?? []}
      selectedId={selectedId}
      onNodeClick={onNodeClick}
    />
  );
}
