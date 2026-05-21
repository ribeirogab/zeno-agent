import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { type JSX, useCallback, useEffect, useState } from 'react';
import { KnowledgeTree } from '@/components/knowledge/tree';
import { KnowledgeViewer } from '@/components/knowledge/viewer';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { useKnowledgeFile, useKnowledgeFiles } from '@/lib/use-knowledge';

export interface KnowledgeSearch {
  file?: string | undefined;
}

const SHOW_META_KEY = 'zeno.knowledge.showMeta';

export const Route = createFileRoute('/_authed/knowledge')({
  validateSearch: (search: Record<string, unknown>): KnowledgeSearch => ({
    file: typeof search.file === 'string' ? search.file : undefined,
  }),
  component: KnowledgeScreen,
});

function KnowledgeScreen(): JSX.Element {
  const { file: filePath } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const filesQuery = useKnowledgeFiles();
  const fileQuery = useKnowledgeFile(filePath);
  const [showMeta, setShowMeta] = useShowMeta();

  const onSelect = useCallback(
    (path: string) => {
      navigate({ search: { file: path } });
    },
    [navigate],
  );

  const onToggleMeta = useCallback(() => {
    setShowMeta((v) => !v);
  }, [setShowMeta]);

  return (
    <>
      <DashboardTopstrip crumbs={[{ label: 'knowledge', current: true }]} />
      <div className="flex gap-6 px-8 pt-8 pb-12 min-w-0">
        <aside className="w-[280px] shrink-0 flex flex-col gap-3 border-r border-border-subtle pr-4">
          <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-text-tertiary cursor-pointer">
            <input
              type="checkbox"
              checked={showMeta}
              onChange={onToggleMeta}
              className="accent-gold"
            />
            show meta files
          </label>
          {filesQuery.isLoading ? (
            <div className="text-text-tertiary text-sm">loading...</div>
          ) : (
            <KnowledgeTree
              files={filesQuery.data?.files ?? []}
              selectedPath={filePath}
              showMeta={showMeta}
              onSelect={onSelect}
            />
          )}
        </aside>
        <main className="flex-1 min-w-0">
          {fileQuery.isError ? (
            <FileMissing onClear={() => navigate({ search: {} })} />
          ) : (
            <KnowledgeViewer file={fileQuery.data ?? null} />
          )}
        </main>
      </div>
    </>
  );
}

function FileMissing({ onClear }: { onClear: () => void }): JSX.Element {
  return (
    <div className="flex flex-col gap-3 p-6 text-text-secondary">
      <p>File not found.</p>
      <button type="button" className="text-gold underline self-start" onClick={onClear}>
        Clear selection
      </button>
    </div>
  );
}

function useShowMeta(): [boolean, (updater: (prev: boolean) => boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SHOW_META_KEY) === 'true';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SHOW_META_KEY, value ? 'true' : 'false');
  }, [value]);
  return [value, setValue];
}
