/**
 * `/connectors` — index screen (artboards A1 + A1b).
 *
 * Spec: vault/specs/2026-05-08-connectors-cli-first-design (Phase 4 / Task 22).
 *
 * Lists every installed item (single connectors, multi-instance groups, Apps)
 * via `<ConnectorGroupCard>`. The `[BROWSE CATALOG]` header button opens
 * `<CatalogModal>`; the modal's `+` buttons open a nested `<CommandModal>`
 * with the install command (the dashboard never mutates state directly under
 * `ZENO_API_WRITES=cli`, which is the default).
 */

import { createFileRoute } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useState } from 'react';
import { CatalogModal } from '@/components/catalog-modal';
import { ConnectorGroupCard } from '@/components/connector-group-card';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { useCatalog } from '@/lib/use-catalog';
import { useConnectors } from '@/lib/use-connectors';

export const Route = createFileRoute('/_authed/connectors/')({
  component: ConnectorsIndexScreen,
});

function ConnectorsIndexScreen(): JSX.Element {
  const connectors = useConnectors();
  const catalog = useCatalog();
  const [catalogOpen, setCatalogOpen] = useState(false);

  const installed = connectors.data ?? [];
  const empty = !connectors.isLoading && installed.length === 0;
  const totalInstances = installed.reduce((acc, entry) => {
    if (entry.kind === 'connector') return acc + 1;
    return acc + entry.installationCount;
  }, 0);

  return (
    <div className="flex min-h-screen bg-canvas">
      <main className="flex-1 flex flex-col overflow-auto">
        <DashboardTopstrip crumbs={[{ label: 'connectors', current: true }]} />
        <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-20 flex flex-col gap-8 min-w-0">
          <Header onBrowse={() => setCatalogOpen(true)} />
          <InstalledSection
            empty={empty}
            loading={connectors.isLoading}
            totalInstances={totalInstances}
            items={installed}
          />
        </div>
      </main>
      {catalogOpen && (
        <CatalogModal
          catalog={catalog.data ?? []}
          installed={installed}
          loading={catalog.isLoading}
          onClose={() => setCatalogOpen(false)}
        />
      )}
    </div>
  );
}

function Header({ onBrowse }: { onBrowse: () => void }): JSX.Element {
  return (
    <header className="flex items-end justify-between gap-6 border-b border-border-subtle pb-6">
      <div className="flex flex-col flex-1">
        <span className="font-mono text-[11px] font-medium tracking-[0.18em] leading-[14px] uppercase text-gold">
          external tools · mcp
        </span>
        <h1 className="font-sans text-[32px] font-medium tracking-[-0.015em] leading-10 text-text-primary mt-2 m-0">
          connectors
        </h1>
        <p className="mt-2.5 max-w-[620px] m-0 font-sans text-sm leading-[1.6] text-text-secondary">
          MCP servers connected to Zeno's agent backend. Stored per-profile in the database.
        </p>
      </div>
      <button
        type="button"
        onClick={onBrowse}
        className="inline-flex items-center gap-2 px-4 py-2 border border-border-strong bg-panel-2 font-mono text-[11px] font-medium tracking-[0.12em] leading-3 uppercase text-text-primary transition-colors duration-[120ms] hover:border-gold-line hover:bg-panel"
      >
        <span aria-hidden className="text-gold">
          ⊞
        </span>
        browse catalog
      </button>
    </header>
  );
}

function InstalledSection({
  empty,
  loading,
  totalInstances,
  items,
}: {
  empty: boolean;
  loading: boolean;
  totalInstances: number;
  items: ReturnType<typeof useConnectors>['data'] extends infer T
    ? T extends Array<infer Item>
      ? Item[]
      : never
    : never;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
        <h2 className="m-0 font-sans text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
          installed
        </h2>
        <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
          {loading
            ? 'loading…'
            : `${totalInstances} ${totalInstances === 1 ? 'instance' : 'instances'}`}
        </span>
      </div>
      {empty ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-4">
          {items?.map((entry) => {
            const key =
              entry.kind === 'connector'
                ? entry.id
                : entry.kind === 'connector_group'
                  ? `group-${entry.catalogId}`
                  : `app-${entry.appUuid}`;
            return <ConnectorGroupCard key={key} item={entry} />;
          })}
        </div>
      )}
    </section>
  );
}

function EmptyState(): JSX.Element {
  return (
    <div className="bg-panel border border-border-subtle px-6 py-16 flex flex-col items-center gap-4 text-center">
      <span
        aria-hidden
        className="w-12 h-12 inline-flex items-center justify-center bg-panel-2 border border-gold-line rounded-[6px] font-mono text-xl text-gold"
      >
        ⊞
      </span>
      <span className="font-sans text-base leading-[1.5] text-text-primary">
        No connectors installed
      </span>
      <span className="font-sans text-[13px] leading-[1.6] text-text-secondary max-w-[360px]">
        Browse the catalog to install your first connector — or run a CLI command directly.
      </span>
      <code className="mt-2 font-mono text-[12px] leading-4 text-text-tertiary">
        $ zeno connector install &lt;catalog-id&gt;
      </code>
    </div>
  );
}
