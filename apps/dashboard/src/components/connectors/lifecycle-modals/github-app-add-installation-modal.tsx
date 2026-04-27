/**
 * M7 — Add Installation modal (auto-discover with multi-select).
 * Spec 0046.
 *
 * Lists installations from /app/installations on GitHub for the currently
 * installed App. Already-wired rows are disabled-checked (visible but cannot
 * be selected). Multi-select via checkboxes; selected count drives the gold
 * CTA. On apply: parallel POSTs to /catalog/github-app/installations; per-row
 * status (spinner → ✓ added | ✗ failed) lets the user retry the failures
 * without re-doing the successes.
 *
 * Has a "Add manually" link at the footer that switches to M8.
 */

import { CornerBrackets, Dialog, DialogContent, DialogTitle } from '@zeno/ui';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useAddInstallation } from '@/lib/use-add-installation';
import {
  type DiscoveredInstallation,
  useDiscoverInstallations,
  useRefetchDiscovery,
} from '@/lib/use-discover-installations';
import { GitHubAppAddInstallationManualModal } from './github-app-add-installation-manual-modal';

interface RowState {
  status: 'idle' | 'pending' | 'success' | 'failed';
  error?: string;
}

interface Props {
  appUuid: string;
  appName: string;
  onClose: () => void;
}

export function GitHubAppAddInstallationModal({ appUuid, appName, onClose }: Props): JSX.Element {
  const discover = useDiscoverInstallations(true);
  const refetch = useRefetchDiscovery();
  const add = useAddInstallation(appUuid);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  // installation.id → state. Idle until apply starts.
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [showManual, setShowManual] = useState(false);

  // When the discover list changes, drop selections that no longer exist.
  // Gate on !isFetching so we don't prune mid-refetch and clobber a
  // selection the user just made (R3 F1 race fix).
  useEffect(() => {
    if (!discover.data || discover.isFetching) return;
    const ids = new Set(discover.data.installations.map((i) => i.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [discover.data, discover.isFetching]);

  if (showManual) {
    return (
      <GitHubAppAddInstallationManualModal
        appUuid={appUuid}
        appName={appName}
        onClose={onClose}
        onBack={() => setShowManual(false)}
      />
    );
  }

  const installations = discover.data?.installations ?? [];

  const toggleSelect = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApply = async (): Promise<void> => {
    const targets = installations.filter((i) => selected.has(i.id) && !i.alreadyWired);
    setRowStates(Object.fromEntries(targets.map((t) => [t.id, { status: 'pending' as const }])));
    // Fire all in parallel; each onSettled flips its row state.
    const results = await Promise.all(
      targets.map(async (t) => {
        try {
          await add.mutateAsync({
            installationId: t.id,
            displayName: t.name,
          });
          return { id: t.id, ok: true as const };
        } catch (err) {
          return {
            id: t.id,
            ok: false as const,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );
    setRowStates((prev) => {
      const next = { ...prev };
      for (const r of results) {
        next[r.id] = r.ok ? { status: 'success' } : { status: 'failed', error: r.error };
      }
      return next;
    });
    // If all succeeded, close the modal automatically.
    if (results.every((r) => r.ok)) {
      // Brief pause so the user sees the green checkmarks.
      setTimeout(onClose, 400);
    }
  };

  const retryRow = async (id: string): Promise<void> => {
    const target = installations.find((i) => i.id === id);
    if (!target) return;
    setRowStates((prev) => ({ ...prev, [id]: { status: 'pending' } }));
    try {
      await add.mutateAsync({
        installationId: target.id,
        displayName: target.name,
      });
      setRowStates((prev) => ({ ...prev, [id]: { status: 'success' } }));
    } catch (err) {
      setRowStates((prev) => ({
        ...prev,
        [id]: { status: 'failed', error: err instanceof Error ? err.message : String(err) },
      }));
    }
  };

  const selectedCount = installations.filter((i) => selected.has(i.id) && !i.alreadyWired).length;
  const applyEnabled = selectedCount > 0 && add.isPending === false;
  const anyApplying = Object.values(rowStates).some((s) => s.status === 'pending');

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[640px]">
        <CornerBrackets />
        <Header
          appName={appName}
          onRefresh={() => refetch.mutate()}
          refetching={discover.isFetching}
        />
        <div className="flex flex-col gap-2 px-7 py-4 max-h-[420px] overflow-auto">
          {discover.isLoading && (
            <span className="font-mono text-xs text-text-tertiary">discovering installations…</span>
          )}
          {discover.isError && (
            <ErrorRow err={discover.error instanceof Error ? discover.error.message : 'failed'} />
          )}
          {installations.length === 0 && discover.isSuccess && (
            <span className="font-mono text-xs text-text-tertiary">
              no installations found · install your App in a GitHub org first
            </span>
          )}
          {installations.map((inst) => (
            <Row
              key={inst.id}
              inst={inst}
              selected={selected.has(inst.id)}
              state={rowStates[inst.id] ?? { status: 'idle' }}
              onToggle={() => toggleSelect(inst.id)}
              onRetry={() => retryRow(inst.id)}
            />
          ))}
        </div>
        <Footer
          selectedCount={selectedCount}
          onCancel={onClose}
          onApply={handleApply}
          onManual={() => setShowManual(true)}
          applyEnabled={applyEnabled}
          applying={anyApplying}
        />
      </DialogContent>
    </Dialog>
  );
}

function Header({
  appName,
  onRefresh,
  refetching,
}: {
  appName: string;
  onRefresh: () => void;
  refetching: boolean;
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border-subtle pt-[22px] px-7 pb-3.5">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-gold">
          add · installations
        </span>
        <DialogTitle className="m-0 font-serif text-[22px] tracking-[-0.015em] leading-7 text-text-primary">
          Add to <em className="italic text-gold">{appName}</em>
        </DialogTitle>
        <span className="font-sans text-xs leading-4 text-text-secondary">
          Pick orgs/users where you've already installed the App on GitHub.
        </span>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refetching}
        className="font-mono text-[10px] tracking-[0.08em] uppercase text-gold hover:underline disabled:opacity-50"
        title="refresh discovery"
      >
        {refetching ? '↻ refreshing…' : '↻ refresh'}
      </button>
    </div>
  );
}

function Row({
  inst,
  selected,
  state,
  onToggle,
  onRetry,
}: {
  inst: DiscoveredInstallation;
  selected: boolean;
  state: RowState;
  onToggle: () => void;
  onRetry: () => void;
}): JSX.Element {
  const disabled = inst.alreadyWired || state.status === 'success' || state.status === 'pending';
  const checkboxChecked = inst.alreadyWired || selected || state.status === 'success';
  return (
    <label
      className={`flex items-center gap-3 px-3 py-2 border ${
        state.status === 'failed'
          ? 'border-status-failed/30 bg-status-failed/[0.04]'
          : 'border-border-subtle'
      } ${disabled && !inst.alreadyWired ? 'opacity-60' : ''} cursor-${disabled ? 'default' : 'pointer'}`}
    >
      <input
        type="checkbox"
        checked={checkboxChecked}
        disabled={disabled}
        onChange={onToggle}
        className="accent-gold"
      />
      <div className="flex-1 flex flex-col gap-[2px] min-w-0">
        <span className="font-mono text-[13px] font-medium tracking-[0.02em] leading-4 text-text-primary truncate">
          {inst.name}
        </span>
        <span className="font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary truncate">
          installation {inst.id} · {inst.accountType.toLowerCase()}
          {inst.repoCount !== null ? ` · ${inst.repoCount} repos` : ' · all repos'}
        </span>
        {state.status === 'failed' && state.error && (
          <span className="font-mono text-[11px] leading-[14px] text-status-failed">
            {state.error}
          </span>
        )}
      </div>
      <RowStatusBadge state={state} alreadyWired={inst.alreadyWired} onRetry={onRetry} />
    </label>
  );
}

function RowStatusBadge({
  state,
  alreadyWired,
  onRetry,
}: {
  state: RowState;
  alreadyWired: boolean;
  onRetry: () => void;
}): JSX.Element | null {
  if (alreadyWired) {
    return (
      <span className="font-mono text-[10px] tracking-[0.1em] leading-3 uppercase text-status-active">
        wired
      </span>
    );
  }
  if (state.status === 'pending') {
    return (
      <span className="font-mono text-[10px] tracking-[0.1em] leading-3 uppercase text-gold">
        adding…
      </span>
    );
  }
  if (state.status === 'success') {
    return (
      <span className="font-mono text-[10px] tracking-[0.1em] leading-3 uppercase text-status-active">
        ✓ added
      </span>
    );
  }
  if (state.status === 'failed') {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          onRetry();
        }}
        className="font-mono text-[10px] tracking-[0.08em] uppercase text-gold hover:underline"
      >
        retry
      </button>
    );
  }
  return null;
}

function ErrorRow({ err }: { err: string }): JSX.Element {
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-status-failed/[0.06] border border-status-failed/30 border-l-2 border-l-status-failed">
      <span className="font-mono text-xs leading-4 text-status-failed">✗</span>
      <span className="flex-1 font-mono text-xs leading-4 text-text-primary">{err}</span>
    </div>
  );
}

function Footer({
  selectedCount,
  onCancel,
  onApply,
  onManual,
  applyEnabled,
  applying,
}: {
  selectedCount: number;
  onCancel: () => void;
  onApply: () => void;
  onManual: () => void;
  applyEnabled: boolean;
  applying: boolean;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2.5 bg-sidebar border-t border-border-subtle px-7 pt-4 pb-[22px]">
      <button
        type="button"
        onClick={onManual}
        className="font-mono text-[10px] tracking-[0.08em] uppercase text-gold hover:underline"
      >
        + add manually
      </button>
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center px-3.5 py-2 border border-border-strong font-mono text-xs font-medium tracking-[0.06em] leading-4 uppercase text-text-primary hover:bg-panel-2 transition-colors duration-[120ms]"
        >
          cancel
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={!applyEnabled}
          className="inline-flex items-center px-3.5 py-2 bg-gold border border-gold font-mono text-xs font-semibold tracking-[0.06em] leading-4 uppercase text-text-ink hover:bg-gold-bright hover:border-gold-bright transition-colors duration-[120ms] disabled:opacity-50"
        >
          {applying
            ? 'adding…'
            : selectedCount > 0
              ? `+ add ${selectedCount} installation${selectedCount === 1 ? '' : 's'}`
              : '+ add'}
        </button>
      </div>
    </div>
  );
}

// Spec 0051: defaultEnvVarForName helper removed (envVar customization
// dropped — the worker authenticates the github-mcp-server subprocess via
// the fixed GITHUB_PERSONAL_ACCESS_TOKEN env var; nothing reads an
// operator-picked name).
