/**
 * `/channels` — Spec 2026-05-11-channels-cli-first §A7.
 *
 * Read-only mirror of the runtime DB `connectors WHERE kind='channel'` joined
 * with the on-disk catalog (`agent/channels-catalog.json`). All actions
 * (INSTALL · CONFIGURE · TEST · ROTATE · UNINSTALL) open a `<CommandModal>`
 * with the equivalent `zeno channel …` snippet — the dashboard never POSTs
 * to /api/channels mutation routes (those are gated by `ZENO_API_WRITES`).
 *
 * The previous form-driven path (install modal, edit-secrets modal, uninstall
 * confirm dialog, $id detail route) was deleted in this spec. There is no
 * legacy `dashboard` writes branch — channels mirror the connectors precedent
 * and land the CLI-first model unconditionally.
 *
 * Visual contract: Paper artboards `CH1` (populated table), `CH2`
 * (not-installed row), `CH3` (disconnected banner) + `M-ch · CommandModal`
 * variants. Catalog drives row identity (one row per catalog entry), runtime
 * data overlays status / last event / last error.
 */

import { createFileRoute } from '@tanstack/react-router';
import { type JSX, useState } from 'react';
import { CommandModal } from '@/components/command-modal';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import type { CommandKind } from '@/lib/build-cli-command';
import {
  type ChannelCatalogEntry,
  type ChannelListItem,
  useChannels,
  useChannelsCatalog,
} from '@/lib/use-channels';

export const Route = createFileRoute('/_authed/channels/')({
  component: ChannelsPage,
});

// ─────────────────────────────────────────────────────────────────
// Status model
// ─────────────────────────────────────────────────────────────────

/**
 * Visual status surfaced in the table. Derived from the runtime row joined
 * with the catalog entry; the dashboard never invents states the API didn't
 * report. Per spec §A7: `CONNECTED` / `NOT INSTALLED` / `DISCONNECTED`.
 */
type ChannelVisualStatus = 'connected' | 'not_installed' | 'disconnected';

function deriveStatus(row: ChannelListItem | undefined): ChannelVisualStatus {
  if (!row) return 'not_installed';
  if (row.lastError) return 'disconnected';
  return 'connected';
}

const STATUS_LABEL: Record<ChannelVisualStatus, string> = {
  connected: 'CONNECTED',
  not_installed: 'NOT INSTALLED',
  disconnected: 'DISCONNECTED',
};

const STATUS_CLASS: Record<ChannelVisualStatus, string> = {
  connected: 'text-status-active',
  not_installed: 'text-text-tertiary',
  disconnected: 'text-status-failed',
};

const STATUS_DOT: Record<ChannelVisualStatus, string> = {
  connected: 'bg-status-active',
  not_installed: 'bg-text-tertiary',
  disconnected: 'bg-status-failed',
};

// ─────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────

function ChannelsPage(): JSX.Element {
  const channels = useChannels({ poll: 'normal' });
  const catalog = useChannelsCatalog();
  const [modal, setModal] = useState<CommandKind | null>(null);

  const rows = channels.data ?? [];
  const catalogEntries = catalog.data ?? [];
  // Surface the first installed channel with a non-null `lastError` per spec
  // §A7. Only one channel can be installed today (single-instance per type +
  // Slack-only catalog), so picking the first match is safe; the model
  // generalises if multiple catalog entries land.
  const erroredRow = rows.find((r) => r.lastError != null);

  const loading = channels.isLoading || catalog.isLoading;

  return (
    <div className="flex min-h-screen bg-canvas">
      <main className="flex-1 flex flex-col overflow-auto">
        <DashboardTopstrip crumbs={[{ label: 'channels', current: true }]} />
        <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-20 flex flex-col gap-8 min-w-0">
          <Header />
          {erroredRow ? <DisconnectedBanner row={erroredRow} onAction={setModal} /> : null}
          <Table catalog={catalogEntries} rows={rows} loading={loading} onAction={setModal} />
          <FooterHint catalogCount={catalogEntries.length} />
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
        transport · input/output
      </span>
      <h1 className="font-serif text-[40px] leading-[1.05] tracking-[-0.01em] text-text-primary m-0">
        channels
      </h1>
      <p className="max-w-[720px] font-mono text-[13px] leading-[1.55] text-text-secondary m-0">
        Where the operator talks to Zeno and Zeno talks back. CLI mutates · dashboard reads. Install
        a channel with <span className="text-gold">zeno channel install</span>.
      </p>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────
// Disconnected banner (CH3)
// ─────────────────────────────────────────────────────────────────

function DisconnectedBanner({
  row,
  onAction,
}: {
  row: ChannelListItem;
  onAction: (spec: CommandKind) => void;
}): JSX.Element {
  return (
    <div
      role="alert"
      className="flex items-start gap-4 border border-status-failed/40 bg-status-failed/[0.06] rounded px-5 py-4"
    >
      <span aria-hidden className="mt-1 w-2 h-2 rounded-full bg-status-failed shrink-0" />
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-status-failed">
          {row.displayName} disconnected
        </span>
        <span className="font-mono text-[12px] text-text-secondary break-words">
          {row.lastError}
        </span>
      </div>
      <ActionChip
        label="ROTATE TOKEN"
        tone="destructive"
        onClick={() => onAction({ kind: 'channel-rotate', slug: row.slug })}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Table (CH1 / CH2)
// ─────────────────────────────────────────────────────────────────

function Table({
  catalog,
  rows,
  loading,
  onAction,
}: {
  catalog: ChannelCatalogEntry[];
  rows: ChannelListItem[];
  loading: boolean;
  onAction: (spec: CommandKind) => void;
}): JSX.Element {
  return (
    <div className="flex flex-col">
      <TableHeader />
      {loading && catalog.length === 0 ? (
        <div className="px-4 py-6 text-text-tertiary font-mono text-[12px]">loading…</div>
      ) : catalog.length === 0 ? (
        <div className="px-4 py-6 text-text-tertiary font-mono text-[12px]">
          channels catalog unavailable
        </div>
      ) : (
        catalog.map((entry) => {
          const installed = rows.find((r) => r.slug === entry.slug || r.catalogId === entry.id);
          return <Row key={entry.id} catalog={entry} installed={installed} onAction={onAction} />;
        })
      )}
    </div>
  );
}

function TableHeader(): JSX.Element {
  const colClass = 'font-mono text-[10px] tracking-[0.18em] uppercase text-text-tertiary';
  return (
    <div className="flex gap-4 px-4 py-2 border-b border-border-subtle items-center">
      <div className={`${colClass} w-[300px]`}>CHANNEL</div>
      <div className={`${colClass} w-[140px]`}>STATUS</div>
      <div className={`${colClass} w-[180px]`}>LAST EVENT</div>
      <div className={`${colClass} flex-1 text-right`}>ACTION</div>
    </div>
  );
}

function Row({
  catalog,
  installed,
  onAction,
}: {
  catalog: ChannelCatalogEntry;
  installed: ChannelListItem | undefined;
  onAction: (spec: CommandKind) => void;
}): JSX.Element {
  const status = deriveStatus(installed);
  // Display the catalog slug as the row identity per spec §A7 (`slack` today).
  // Per the spec text: "Slug placeholders should be the actual catalog id from
  // the row". For Slack the slug and catalog id are identical; for future
  // channels we prefer the slug because it survives display-name renames.
  const slug = installed?.slug ?? catalog.slug;
  const lastEvent = formatLastEvent(installed);
  const isConnected = status === 'connected';
  const isDisconnected = status === 'disconnected';
  const isInstalled = installed != null;

  return (
    <div className="flex gap-4 px-4 py-4 border-b border-border-subtle items-center relative">
      {isConnected ? (
        <span aria-hidden className="absolute left-0 top-3 w-[2px] h-9 bg-gold" />
      ) : null}
      <div className="w-[300px] flex gap-3 items-center min-w-0">
        <div className="w-8 h-8 rounded bg-panel-2 flex items-center justify-center shrink-0 overflow-hidden">
          {catalog.iconUrl ? (
            <img src={catalog.iconUrl} alt="" className="w-[22px] h-[22px] object-contain" />
          ) : (
            <span className="font-mono text-xs font-semibold text-text-tertiary">
              {catalog.name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <div className="font-mono text-[13px] font-semibold text-text-primary truncate">
            {slug}
          </div>
          <div className="font-mono text-[11px] text-text-tertiary truncate">{catalog.name}</div>
        </div>
      </div>
      <div className={`w-[140px] flex gap-2 items-center ${STATUS_CLASS[status]}`}>
        <span aria-hidden className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
        <span className="font-mono text-[11px] tracking-[0.06em] uppercase">
          {STATUS_LABEL[status]}
        </span>
      </div>
      <div className="w-[180px] font-mono text-[12px] text-text-secondary">{lastEvent}</div>
      <div className="flex-1 flex justify-end gap-2 flex-wrap">
        {!isInstalled ? (
          <ActionChip
            label="INSTALL"
            tone="gold"
            onClick={() => onAction({ kind: 'channel-install' })}
          />
        ) : (
          <>
            {isDisconnected ? (
              <ActionChip
                label="ROTATE"
                tone="destructive"
                onClick={() => onAction({ kind: 'channel-rotate', slug })}
              />
            ) : (
              <>
                <ActionChip label="TEST" onClick={() => onAction({ kind: 'channel-test', slug })} />
                <ActionChip
                  label="CONFIGURE"
                  onClick={() => onAction({ kind: 'channel-configure', slug })}
                />
                <ActionChip
                  label="ROTATE"
                  onClick={() => onAction({ kind: 'channel-rotate', slug })}
                />
              </>
            )}
            <ActionChip
              label="UNINSTALL"
              tone="destructive"
              onClick={() => onAction({ kind: 'channel-uninstall', slug })}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Last event formatting
// ─────────────────────────────────────────────────────────────────

/**
 * Resolve the "last event" cell. Prefers `lastErrorAt` over `lastVerifiedAt`
 * when both are set so the table surfaces the freshest signal (a successful
 * probe followed by a websocket drop should show the drop time, not the
 * probe time). Returns an em-dash placeholder when neither is set.
 */
function formatLastEvent(row: ChannelListItem | undefined): string {
  if (!row) return '—';
  const ts = row.lastErrorAt ?? row.lastVerifiedAt;
  if (!ts) return 'never';
  return formatRelative(ts);
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

// ─────────────────────────────────────────────────────────────────
// Action chip (matches /backend visual language)
// ─────────────────────────────────────────────────────────────────

function ActionChip(props: {
  label: string;
  tone?: 'gold' | 'neutral' | 'destructive';
  onClick: () => void;
}): JSX.Element {
  const tone = props.tone ?? 'neutral';
  const cls =
    tone === 'gold'
      ? 'border-gold/40 text-gold bg-gold/10 hover:bg-gold/15'
      : tone === 'destructive'
        ? 'border-status-failed/40 text-status-failed hover:bg-status-failed/10'
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

// ─────────────────────────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────────────────────────

function FooterHint({ catalogCount }: { catalogCount: number }): JSX.Element {
  return (
    <div className="font-mono text-[11px] text-text-tertiary tracking-[0.04em]">
      catalog · agent/channels-catalog.json · {catalogCount} entr
      {catalogCount === 1 ? 'y' : 'ies'} · pluggable surface
    </div>
  );
}
