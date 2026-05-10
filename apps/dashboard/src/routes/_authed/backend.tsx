/**
 * `/backend` — Spec 0072 — top-level dashboard page for backend management.
 *
 * Read-only mirror of the runtime DB `backend_credentials` joined with the
 * on-disk catalog. All actions (TEST · ROTATE · CONFIGURE) open a
 * CommandModal with the equivalent `zeno backend …` snippet — the dashboard
 * never POSTs to /api/backends mutation routes (those are deleted in this
 * PR's Phase 7).
 *
 * Visual contract: vault Paper artboard `1B8A-0` (V2 compact rows).
 */

import { createFileRoute } from '@tanstack/react-router';
import { type JSX, useState } from 'react';
import { CommandModal } from '@/components/command-modal';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import type { CommandKind } from '@/lib/build-cli-command';
import { type BackendListItem, type BackendStatus, useBackends } from '@/lib/use-backends';

const IMPLEMENTED = new Set(['claude-code']);

export const Route = createFileRoute('/_authed/backend')({
  component: BackendPage,
});

function BackendPage(): JSX.Element {
  const backends = useBackends();
  const [modal, setModal] = useState<CommandKind | null>(null);

  const items = backends.data?.backends ?? [];

  return (
    <div className="flex min-h-screen bg-canvas">
      <main className="flex-1 flex flex-col overflow-auto">
        <DashboardTopstrip crumbs={[{ label: 'backend', current: true }]} />
        <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-20 flex flex-col gap-8 min-w-0">
          <Header />
          <Table items={items} onAction={setModal} loading={backends.isLoading} />
          <FooterHint catalogCount={items.length} />
        </div>
      </main>
      {modal ? <CommandModal spec={modal} onClose={() => setModal(null)} /> : null}
    </div>
  );
}

function Header(): JSX.Element {
  return (
    <header className="flex flex-col gap-3.5">
      <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-text-tertiary">
        runtime
      </span>
      <h1 className="font-serif text-[40px] leading-[1.05] tracking-[-0.01em] text-text-primary">
        backend
      </h1>
      <p className="max-w-[720px] font-mono text-[13px] leading-[1.55] text-text-secondary">
        Agent runtimes installed in this profile. CLI mutates · dashboard reads. Configure each
        backend with <span className="text-gold">zeno backend configure</span>.
      </p>
    </header>
  );
}

function Table(props: {
  items: BackendListItem[];
  onAction: (spec: CommandKind) => void;
  loading: boolean;
}): JSX.Element {
  return (
    <div className="flex flex-col">
      <TableHeader />
      {props.loading && props.items.length === 0 ? (
        <div className="px-4 py-6 text-text-tertiary font-mono text-[12px]">loading…</div>
      ) : (
        props.items.map((b) => <Row key={b.id} backend={b} onAction={props.onAction} />)
      )}
    </div>
  );
}

function TableHeader(): JSX.Element {
  const colClass = 'font-mono text-[10px] tracking-[0.18em] uppercase text-text-tertiary';
  return (
    <div className="flex gap-4 px-4 py-2 border-b border-border-subtle items-center">
      <div className={`${colClass} w-[320px]`}>BACKEND</div>
      <div className={`${colClass} w-[110px]`}>STATUS</div>
      <div className={`${colClass} w-[180px]`}>LAST TEST</div>
      <div className={`${colClass} w-[130px]`}>SCOPE</div>
      <div className={`${colClass} flex-1 text-right`}>ACTION</div>
    </div>
  );
}

const STATUS_CLASS: Record<BackendStatus, string> = {
  active: 'text-status-active',
  expired: 'text-status-failed',
  failed: 'text-status-failed',
  untested: 'text-text-secondary',
  not_configured: 'text-text-tertiary',
};

const STATUS_DOT: Record<BackendStatus, string> = {
  active: 'bg-status-active',
  expired: 'bg-status-failed',
  failed: 'bg-status-failed',
  untested: 'bg-text-secondary',
  not_configured: 'bg-text-tertiary',
};

function statusLabel(s: BackendStatus): string {
  if (s === 'not_configured') return 'NOT CONFIGURED';
  return s.toUpperCase();
}

function fmtTs(ts: number | null): string {
  if (ts === null) return 'never';
  return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
}

function Row(props: {
  backend: BackendListItem;
  onAction: (spec: CommandKind) => void;
}): JSX.Element {
  const { backend } = props;
  const implemented = IMPLEMENTED.has(backend.id);
  const isActive = backend.status === 'active';

  return (
    <div className="flex gap-4 px-4 py-4 border-b border-border-subtle items-center relative">
      {isActive && implemented ? (
        <span className="absolute left-0 top-3 w-[2px] h-9 bg-gold" />
      ) : null}
      <div className="w-[320px] flex gap-3 items-center">
        <div className="w-8 h-8 rounded bg-panel-2 flex items-center justify-center shrink-0 overflow-hidden">
          {backend.logoUrl ? (
            <img src={backend.logoUrl} alt="" className="w-[22px] h-[22px] object-contain" />
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <div className="font-mono text-[13px] font-semibold text-text-primary">{backend.id}</div>
          <div className="font-mono text-[11px] text-text-tertiary">{backend.name}</div>
        </div>
      </div>
      <div className={`w-[110px] flex gap-2 items-center ${STATUS_CLASS[backend.status]}`}>
        <span className={`w-2 h-2 rounded-full ${STATUS_DOT[backend.status]}`} />
        <span className="font-mono text-[11px] tracking-[0.06em] uppercase">
          {statusLabel(backend.status)}
        </span>
      </div>
      <div className="w-[180px] font-mono text-[12px] text-text-secondary">
        {fmtTs(backend.last_tested_at)}
      </div>
      <div className="w-[130px] font-mono text-[12px] text-text-secondary">
        {backend.status === 'not_configured' ? 'no creds yet' : 'profile · aes-256-gcm'}
      </div>
      <div className="flex-1 flex justify-end gap-2">
        {implemented && isActive ? (
          <>
            <ActionChip
              label="TEST"
              onClick={() => props.onAction({ kind: 'backend-test', slug: backend.id })}
            />
            <ActionChip
              label="ROTATE"
              onClick={() => props.onAction({ kind: 'backend-rotate', slug: backend.id })}
            />
          </>
        ) : null}
        {implemented ? (
          <ActionChip
            label="CONFIGURE"
            tone="gold"
            onClick={() => props.onAction({ kind: 'backend-configure', slug: backend.id })}
          />
        ) : (
          <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-text-tertiary px-3 py-1.5">
            coming soon
          </span>
        )}
      </div>
    </div>
  );
}

function ActionChip(props: {
  label: string;
  tone?: 'gold' | 'neutral';
  onClick: () => void;
}): JSX.Element {
  const cls =
    props.tone === 'gold'
      ? 'border-gold/40 text-gold bg-gold/10 hover:bg-gold/15'
      : 'border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-strong';
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`px-3 py-1.5 border rounded font-mono text-[11px] tracking-[0.08em] uppercase transition-colors duration-[120ms] ${cls}`}
    >
      {props.label}
    </button>
  );
}

function FooterHint({ catalogCount }: { catalogCount: number }): JSX.Element {
  return (
    <div className="font-mono text-[11px] text-text-tertiary tracking-[0.04em]">
      catalog · agent/backends-catalog.json · {catalogCount} entr{catalogCount === 1 ? 'y' : 'ies'}{' '}
      · pluggable surface
    </div>
  );
}
