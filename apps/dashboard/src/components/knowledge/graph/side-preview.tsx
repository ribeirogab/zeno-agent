import type { JSX } from 'react';
import { KnowledgeViewer } from '@/components/knowledge/viewer';
import { useKnowledgeFile } from '@/lib/use-knowledge';

interface SidePreviewProps {
  file: string | undefined;
  onClose: () => void;
}

export function SidePreview({ file, onClose }: SidePreviewProps): JSX.Element | null {
  const fileQuery = useKnowledgeFile(file);
  if (file === undefined) return null;

  return (
    <aside
      style={{ width: 480 }}
      className="shrink-0 border-l border-border-subtle bg-panel flex flex-col"
    >
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-wide text-text-tertiary truncate">
          {file}
        </span>
        <button
          type="button"
          aria-label="close preview"
          onClick={onClose}
          className="text-text-secondary hover:text-text-primary shrink-0"
        >
          ×
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {fileQuery.isError ? (
          <p className="text-text-secondary">File not found.</p>
        ) : (
          <KnowledgeViewer file={fileQuery.data ?? null} />
        )}
      </div>
    </aside>
  );
}
