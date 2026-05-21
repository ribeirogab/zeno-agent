import { type JSX, useMemo } from 'react';
import { Canvas } from './canvas';
import { Controls } from './controls';
import { applyFilters } from './filter-graph';
import { SidePreview } from './side-preview';
import { useGraphData } from './use-graph-data';
import { useGraphDisplay, useGraphFilters } from './use-graph-state';

interface GraphViewProps {
  file: string | undefined;
  onFileChange: (next: string | undefined) => void;
}

export default function GraphView({ file, onFileChange }: GraphViewProps): JSX.Element {
  const dataQuery = useGraphData();
  const [filters, setFilters] = useGraphFilters();
  const [display, setDisplay] = useGraphDisplay();

  const filtered = useMemo(() => {
    if (!dataQuery.data) return { nodes: [], links: [] };
    return applyFilters(dataQuery.data, filters);
  }, [dataQuery.data, filters]);

  if (dataQuery.isLoading) {
    return <div className="flex-1 p-6 text-text-tertiary">Loading graph…</div>;
  }
  if (dataQuery.isError) {
    return (
      <div className="flex-1 p-6 text-text-secondary">
        Failed to load graph.{' '}
        <button type="button" onClick={() => dataQuery.refetch()} className="underline text-gold">
          Retry
        </button>
      </div>
    );
  }
  if ((dataQuery.data?.nodes.length ?? 0) === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-text-secondary text-center">
        <p>
          No notes to graph. Add files under <code>~/.zeno/profiles/&lt;name&gt;/knowledge/</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-w-0">
      <Canvas
        nodes={filtered.nodes}
        links={filtered.links}
        groups={dataQuery.data?.groups ?? []}
        display={display}
        onNodeClick={(id) => {
          if (id.startsWith('?ghost:')) return;
          onFileChange(id);
        }}
      />
      <Controls
        raw={dataQuery.data}
        filters={filters}
        onFiltersChange={setFilters}
        display={display}
        onDisplayChange={setDisplay}
      />
      <SidePreview file={file} onClose={() => onFileChange(undefined)} />
    </div>
  );
}
