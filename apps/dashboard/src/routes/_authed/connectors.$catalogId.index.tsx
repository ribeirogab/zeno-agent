/**
 * `/connectors/:catalogId` — plain leaves list (artboard A4).
 *
 * Spec: vault/specs/2026-05-08-connectors-cli-first-design (Task 19).
 *
 * Renders the installed instances for a given catalog entry. Mutating actions
 * (Install another, Test, Refresh tools, Enable/Disable, Uninstall) all open
 * `<CommandModal>` rather than executing — the dashboard is read-only under
 * `ZENO_API_WRITES=cli` (the default). The corresponding `zeno connector …`
 * command is shown for the operator to run from the terminal.
 *
 * Shape note: the schema does not yet have a `connector_group` row type. We
 * derive the "group" view from `useConnectors()` by filtering `kind:'connector'`
 * entries that share the same `catalogId`. App-pattern catalogs (`kind:'app'`)
 * have a different layout (artboard A6a) and live elsewhere — A4 is plain only.
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useState } from 'react';
import { CommandModal } from '@/components/command-modal';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import type { CommandKind } from '@/lib/build-cli-command';
import { useCatalog } from '@/lib/use-catalog';
import { type ConnectorListItem, useConnectors } from '@/lib/use-connectors';

export const Route = createFileRoute('/_authed/connectors/$catalogId/')({
  component: ConnectorLeavesScreen,
});

type RowVisualStatus = 'active' | 'error' | 'off' | 'pending';

function ConnectorLeavesScreen(): JSX.Element {
  const { catalogId } = Route.useParams();
  const connectors = useConnectors();
  const catalog = useCatalog();
  const [command, setCommand] = useState<CommandKind | null>(null);

  const allEntries = connectors.data ?? [];
  // A4 is plain-pattern only — App rows have their own layout (A6a/A6b).
  const instances = allEntries.flatMap((entry) =>
    entry.kind === 'connector' && entry.catalogId === catalogId ? [entry] : [],
  );
  const catalogEntry = (catalog.data ?? []).find((c) => c.id === catalogId);

  const counts = instances.reduce(
    (acc, c) => {
      const status = visualStatus(c);
      if (status === 'active') acc.active += 1;
      else if (status === 'error') acc.error += 1;
      else if (status === 'off') acc.off += 1;
      else acc.pending += 1;
      return acc;
    },
    { active: 0, error: 0, off: 0, pending: 0 },
  );

  // Page title/description: catalog entry is the source of truth. Fallback to
  // the first instance's displayName / description when the catalog hasn't
  // resolved yet so the page degrades gracefully on slow networks.
  const fallback = instances[0];
  const title = catalogEntry?.name ?? fallback?.displayName ?? catalogId;
  const description =
    catalogEntry?.description ??
    fallback?.description ??
    'No description available for this catalog entry.';

  return (
    <div className="flex min-h-screen bg-canvas">
      <main className="flex-1 flex flex-col overflow-auto">
        <DashboardTopstrip
          crumbs={[
            { label: 'connectors', to: '/connectors' },
            { label: catalogId, current: true },
          ]}
        />
        <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-20 flex flex-col gap-8 min-w-0">
          <Header
            title={title}
            description={description}
            onInstallAnother={() => setCommand({ kind: 'install', catalogId })}
          />
          <InstancesSection
            instances={instances}
            loading={connectors.isLoading}
            counts={counts}
            onCommand={setCommand}
          />
        </div>
      </main>
      {command && <CommandModal spec={command} onClose={() => setCommand(null)} />}
    </div>
  );
}

function Header({
  title,
  description,
  onInstallAnother,
}: {
  title: string;
  description: string;
  onInstallAnother: () => void;
}): JSX.Element {
  return (
    <header className="flex items-end justify-between gap-6 border-b border-border-subtle pb-6">
      <div className="flex flex-col flex-1">
        <span className="font-mono text-[11px] font-medium tracking-[0.18em] leading-[14px] uppercase text-gold">
          connector · plain
        </span>
        <h1 className="font-sans text-[32px] font-medium tracking-[-0.015em] leading-10 text-text-primary mt-2 m-0">
          {title}
        </h1>
        <p className="mt-2.5 max-w-[620px] m-0 font-sans text-sm leading-[1.6] text-text-secondary">
          {description}
        </p>
      </div>
      <button
        type="button"
        onClick={onInstallAnother}
        className="inline-flex items-center gap-2 px-4 py-2 border border-border-strong bg-panel-2 font-mono text-[11px] font-medium tracking-[0.12em] leading-3 uppercase text-text-primary transition-colors duration-[120ms] hover:border-gold-line hover:bg-panel"
      >
        <span aria-hidden className="text-gold">
          ⊞
        </span>
        install another
      </button>
    </header>
  );
}

function InstancesSection({
  instances,
  loading,
  counts,
  onCommand,
}: {
  instances: ConnectorListItem[];
  loading: boolean;
  counts: { active: number; error: number; off: number; pending: number };
  onCommand: (cmd: CommandKind) => void;
}): JSX.Element {
  const total = instances.length;
  const summary = (() => {
    if (loading) return 'loading…';
    if (total === 0) return 'no instances installed';
    const parts: string[] = [`${total} ${total === 1 ? 'instance' : 'instances'}`];
    if (counts.active > 0) parts.push(`${counts.active} active`);
    if (counts.error > 0) parts.push(`${counts.error} error`);
    if (counts.pending > 0) parts.push(`${counts.pending} pending`);
    if (counts.off > 0) parts.push(`${counts.off} off`);
    return parts.join(' · ');
  })();
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
        <h2 className="m-0 font-sans text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
          instances
        </h2>
        <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
          {summary}
        </span>
      </div>
      {total === 0 && !loading ? (
        <EmptyState />
      ) : (
        <div className="bg-panel border border-border-subtle flex flex-col min-w-0 overflow-x-auto">
          {instances.map((c, i) => (
            <InstanceRow
              key={c.id}
              connector={c}
              last={i === instances.length - 1}
              onCommand={onCommand}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyState(): JSX.Element {
  return (
    <div className="bg-panel border border-border-subtle px-6 py-8 flex flex-col items-center gap-1 text-center">
      <span className="font-sans text-[13px] leading-[1.6] text-text-secondary">
        Nothing installed yet for this catalog. Click{' '}
        <span className="font-mono text-gold">install another</span> to get started.
      </span>
    </div>
  );
}

function InstanceRow({
  connector,
  last,
  onCommand,
}: {
  connector: ConnectorListItem;
  last: boolean;
  onCommand: (cmd: CommandKind) => void;
}): JSX.Element {
  const status = visualStatus(connector);
  const lastVerifiedLabel = connector.lastVerifiedAt
    ? formatRelative(connector.lastVerifiedAt)
    : connector.status === 'pending'
      ? 'never tested'
      : '—';
  const muted = connector.status === 'disabled';

  return (
    <div
      className={`group/row flex items-center gap-4 px-5 py-3.5 ${
        last ? '' : 'border-b border-border-subtle'
      } min-w-[640px]`}
    >
      <Link
        to="/connectors/$id"
        params={{ id: connector.id }}
        className={`flex flex-1 min-w-0 items-center gap-3 transition-colors duration-[120ms] ${
          muted ? 'opacity-60' : ''
        } hover:text-gold`}
      >
        <span
          className={`font-mono text-[13px] font-medium tracking-[0.02em] leading-4 truncate ${
            muted ? 'text-text-secondary' : 'text-text-primary'
          }`}
        >
          {connector.displayName}
        </span>
      </Link>
      <span className="w-[100px] shrink-0 inline-flex">
        <StatusPill status={status} />
      </span>
      <span
        className={`w-[80px] shrink-0 text-right font-mono text-[11px] leading-[14px] ${
          connector.status === 'pending' ? 'italic text-text-tertiary' : 'text-text-tertiary'
        }`}
      >
        {lastVerifiedLabel}
      </span>
      <KebabMenu connector={connector} onCommand={onCommand} />
    </div>
  );
}

function KebabMenu({
  connector,
  onCommand,
}: {
  connector: ConnectorListItem;
  onCommand: (cmd: CommandKind) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const enabled = connector.status === 'enabled';
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${connector.displayName}`}
        onClick={() => setOpen((o) => !o)}
        className="w-6 h-6 inline-flex items-center justify-center font-mono text-xs text-text-tertiary hover:text-text-primary"
      >
        ⋯
      </button>
      {open && (
        <>
          {/* Click-outside catcher. */}
          <button
            type="button"
            aria-label="dismiss menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default bg-transparent"
          />
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+6px)] z-30 w-[180px] bg-panel border border-border-subtle shadow-[0_12px_24px_-8px_rgba(0,0,0,0.7)] flex flex-col"
          >
            <MenuItem
              onClick={() => {
                setOpen(false);
                onCommand({ kind: 'test', slug: connector.slug });
              }}
            >
              test
            </MenuItem>
            <MenuItem
              onClick={() => {
                setOpen(false);
                onCommand({ kind: 'refresh-tools', slug: connector.slug });
              }}
            >
              refresh tools
            </MenuItem>
            <MenuItem
              onClick={() => {
                setOpen(false);
                onCommand(
                  enabled
                    ? { kind: 'disable', slug: connector.slug }
                    : { kind: 'enable', slug: connector.slug },
                );
              }}
            >
              {enabled ? 'disable' : 'enable'}
            </MenuItem>
            <span className="h-px bg-border-subtle mx-1.5" />
            <MenuItem
              destructive
              onClick={() => {
                setOpen(false);
                onCommand({ kind: 'uninstall', slug: connector.slug });
              }}
            >
              uninstall
            </MenuItem>
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  destructive,
  onClick,
  children,
}: {
  destructive?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`text-left px-3.5 py-2.5 font-mono text-[11px] tracking-[0.08em] leading-3 uppercase ${
        destructive
          ? 'text-text-secondary hover:bg-status-failed/[0.08] hover:text-status-failed'
          : 'text-text-secondary hover:bg-gold-soft hover:text-gold'
      }`}
    >
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: RowVisualStatus }): JSX.Element {
  const config = {
    active: {
      cls: 'bg-status-active/[0.06] border border-status-active/30 text-status-active',
      dot: 'bg-status-active',
      label: 'active',
    },
    error: {
      cls: 'bg-status-failed/[0.06] border border-status-failed/30 text-status-failed',
      dot: 'bg-status-failed',
      label: 'error',
    },
    off: {
      cls: 'bg-panel-2 border border-border-subtle text-text-tertiary',
      dot: 'bg-text-tertiary',
      label: 'off',
    },
    pending: {
      cls: 'bg-gold/10 border border-gold-line text-gold',
      dot: 'bg-gold',
      label: 'pending',
    },
  }[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-[3px] font-mono text-[10px] tracking-[0.1em] leading-3 uppercase ${config.cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

function visualStatus(c: ConnectorListItem): RowVisualStatus {
  if (c.status === 'enabled') return c.lastError ? 'error' : 'active';
  if (c.status === 'disabled') return 'off';
  return 'pending';
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
