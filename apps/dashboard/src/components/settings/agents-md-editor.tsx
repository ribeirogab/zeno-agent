import { useBlocker } from '@tanstack/react-router';
import { type JSX, useCallback, useEffect, useRef, useState } from 'react';
import { useUpdateAgentsMd } from '@/lib/mutations';
import { useAgentsMd } from '@/lib/use-agents-md';

/**
 * Spec 2026-05-20 (agents-md-per-instance): inline AGENTS.md editor on
 * the profile settings tab.
 *
 * Behavior:
 * - Loads content via `useAgentsMd()` once on mount.
 * - Buffer state mirrors the textarea; `dirty = buffer !== savedContent`.
 * - When dirty: shows the unsaved chip + the gold "save (⌘S)" button.
 * - `Cmd+S` / `Ctrl+S` triggers save while the textarea is focused.
 * - `useBlocker` from TanStack Router pops a confirm on intra-app
 *   navigation while dirty. `beforeunload` covers tab close / refresh.
 * - On 200 from PUT: chip disappears, mtime label updates ("just now").
 * - On 404 (AGENTS.md not yet on disk): editor seeds with empty content
 *   and Save creates the file.
 */
export function AgentsMdEditor(): JSX.Element {
  const { data, isLoading, isError, error } = useAgentsMd();
  const update = useUpdateAgentsMd();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [buffer, setBuffer] = useState<string>('');
  const [savedContent, setSavedContent] = useState<string>('');
  const [savedMtime, setSavedMtime] = useState<string | null>(null);

  // Hydrate buffer when fetched. We update only when the loaded content
  // differs from what we last wrote to (otherwise typing while a refetch
  // resolves would clobber in-flight edits).
  useEffect(() => {
    if (data && data.content !== savedContent) {
      setBuffer(data.content);
      setSavedContent(data.content);
      setSavedMtime(data.mtime);
    }
    // 404 path: AGENTS.md missing → seed empty buffer (savedContent stays '')
    // so dirty=false and Save creates the file with whatever the user types.
    if (isError && error && /not_found/.test(String(error))) {
      setBuffer('');
      setSavedContent('');
      setSavedMtime(null);
    }
  }, [data, isError, error, savedContent]);

  const dirty = buffer !== savedContent;

  const save = useCallback(() => {
    if (!dirty) return;
    update.mutate(buffer, {
      onSuccess: (response) => {
        setSavedContent(response.content);
        setSavedMtime(response.mtime);
      },
    });
  }, [buffer, dirty, update]);

  // ⌘S / Ctrl+S while the textarea is focused — global keydown scoped
  // to the editor focus state via document.activeElement.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const isModSave =
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 's';
      if (!isModSave) return;
      if (document.activeElement !== textareaRef.current) return;
      event.preventDefault();
      save();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  // Intra-app navigation guard while dirty.
  useBlocker({
    shouldBlockFn: () => {
      if (!dirty) return false;
      return !window.confirm('Discard unsaved changes to AGENTS.md?');
    },
  });

  // Page-leave guard while dirty.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
        <div className="flex items-baseline gap-3">
          <h2 className="font-sans text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary m-0">
            AGENTS.md
          </h2>
          <span className="font-mono text-[10px] tracking-[0.04em] text-text-tertiary">
            profile/AGENTS.md{savedMtime ? ` · ${formatRelative(savedMtime)}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {dirty ? (
            <div className="flex items-center gap-1.5 border border-gold/40 bg-gold/[0.08] px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-gold" />
              <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-gold">
                unsaved
              </span>
            </div>
          ) : (
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-text-tertiary">
              {savedMtime ? 'saved' : 'not yet on disk'}
            </span>
          )}
          {dirty ? (
            <button
              type="button"
              onClick={save}
              disabled={update.isPending}
              className="inline-flex items-center gap-2 bg-gold text-text-ink px-3 py-1.5 font-mono text-[11px] font-semibold tracking-[0.12em] uppercase disabled:opacity-50"
            >
              save
              <span className="font-mono text-[10px] tracking-[0.1em]">⌘S</span>
            </button>
          ) : null}
        </div>
      </div>
      <div className="bg-panel border border-border-subtle flex flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-border-subtle bg-panel-2 px-4 py-2">
          <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-text-tertiary">
            markdown · read-write
          </span>
          <span className="font-mono text-[10px] tracking-[0.04em] text-text-tertiary">
            ⌘S to save · soft-wrap on
          </span>
        </div>
        {isLoading ? (
          <div className="px-5 py-12 font-mono text-xs text-text-tertiary">loading AGENTS.md…</div>
        ) : (
          <textarea
            ref={textareaRef}
            value={buffer}
            onChange={(e) => setBuffer(e.target.value)}
            wrap="soft"
            spellCheck={false}
            className="block w-full min-h-[420px] resize-y bg-transparent px-5 py-4 font-mono text-[13px] leading-[22px] text-text-primary outline-none focus:bg-panel-2/30"
            aria-label="AGENTS.md content"
          />
        )}
      </div>
    </section>
  );
}

function formatRelative(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return 'just now';
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
  } catch {
    return iso;
  }
}
