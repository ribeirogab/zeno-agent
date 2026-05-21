import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { type JSX, lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { LazyErrorBoundary } from '@/components/knowledge/lazy-error-boundary';
import { KnowledgeTree } from '@/components/knowledge/tree';
import { type ViewMode, ViewToggle } from '@/components/knowledge/view-toggle';
import { KnowledgeViewer } from '@/components/knowledge/viewer';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { useKnowledgeFile, useKnowledgeFiles } from '@/lib/use-knowledge';

const GraphView = lazy(() => import('@/components/knowledge/graph'));

export interface KnowledgeSearch {
  file?: string | undefined;
  view?: 'tree' | 'graph' | undefined;
}

const SHOW_META_KEY = 'zeno.knowledge.showMeta';

export const Route = createFileRoute('/_authed/knowledge')({
  validateSearch: (search: Record<string, unknown>): KnowledgeSearch => ({
    file: typeof search.file === 'string' ? search.file : undefined,
    view: search.view === 'graph' ? 'graph' : search.view === 'tree' ? 'tree' : undefined,
  }),
  component: KnowledgeScreen,
});

function KnowledgeScreen(): JSX.Element {
  const { file: filePath, view } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const filesQuery = useKnowledgeFiles();
  const [showMeta, setShowMeta] = useShowMeta();

  const mode: ViewMode = view === 'graph' ? 'graph' : 'tree';
  const isFiles = mode === 'tree';
  const fileQuery = useKnowledgeFile(isFiles ? filePath : undefined);

  const onModeChange = useCallback(
    (next: ViewMode) => {
      navigate({
        search: (prev) => ({ ...prev, view: next === 'tree' ? undefined : 'graph' }),
      });
    },
    [navigate],
  );

  const onSelect = useCallback(
    (path: string) => {
      navigate({ search: (prev) => ({ ...prev, file: path }) });
    },
    [navigate],
  );

  const onClearFile = useCallback(() => {
    navigate({ search: (prev) => ({ ...prev, file: undefined }) });
  }, [navigate]);

  const onNodeClick = useCallback(
    (id: string) => {
      if (id.startsWith('?ghost:') || id.startsWith('?tag:')) return;
      navigate({ search: (prev) => ({ ...prev, file: id, view: undefined }) });
    },
    [navigate],
  );

  const onToggleMeta = useCallback(() => setShowMeta((v) => !v), [setShowMeta]);

  return (
    <>
      <DashboardTopstrip crumbs={[{ label: 'knowledge', current: true }]} />
      <div className="flex flex-col h-[calc(100vh-64px)]">
        <header className="flex items-center px-8 py-3 border-b border-border-subtle shrink-0">
          <ViewToggle value={mode} onChange={onModeChange} />
        </header>
        {mode === 'graph' ? (
          <main className="flex-1 min-h-0 min-w-0">
            <LazyErrorBoundary>
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center p-6 text-text-tertiary">
                    Loading graph…
                  </div>
                }
              >
                <GraphView selectedId={filePath} onNodeClick={onNodeClick} />
              </Suspense>
            </LazyErrorBoundary>
          </main>
        ) : (
          <div className="flex flex-1 min-h-0 min-w-0">
            <aside className="w-[280px] shrink-0 flex flex-col gap-3 border-r border-border-subtle bg-panel/40 p-4 overflow-y-auto">
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
                <div className="text-text-tertiary text-sm">loading…</div>
              ) : (
                <KnowledgeTree
                  files={filesQuery.data?.files ?? []}
                  selectedPath={filePath}
                  showMeta={showMeta}
                  onSelect={onSelect}
                />
              )}
            </aside>
            <main className="flex-1 min-w-0 overflow-y-auto">
              {filePath === undefined ? (
                <FilesEmpty />
              ) : fileQuery.isError ? (
                <FileMissing onClear={onClearFile} />
              ) : (
                <div className="px-12 py-8 max-w-3xl mx-auto">
                  <KnowledgeViewer file={fileQuery.data ?? null} />
                </div>
              )}
            </main>
          </div>
        )}
      </div>
    </>
  );
}

function FilesEmpty(): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center p-6 text-text-tertiary text-center">
      <p>Select a note from the sidebar.</p>
    </div>
  );
}

function FileMissing({ onClear }: { onClear: () => void }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-text-secondary">
      <p>File not found.</p>
      <button type="button" className="text-gold underline" onClick={onClear}>
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
