/**
 * `ConnectorGroupCard` — single padronized card for the `/connectors` index
 * (artboard A1). One component serves three variants:
 *
 *   - `ConnectorListItem` (`kind: 'connector'`) — single-instance plain
 *     catalog or custom row. Renders the header + a single drill row.
 *   - `ConnectorGroupListItem` (`kind: 'connector_group'`) — multi-instance
 *     plain catalog (e.g. 3 Linear workspaces). Header + N drill rows.
 *   - `AppListItem` (`kind: 'app'`) — App pattern (e.g. github-app). Header +
 *     an identity slot (App / App ID / PEM fingerprint) + N installation rows.
 *
 * Mutating actions are out of scope here — every clickable row navigates to
 * the appropriate detail route. Per-row kebabs are visual only at this layer
 * (the leaves list at `/connectors/:catalogId` owns the destructive surface).
 *
 * Spec: vault/specs/2026-05-08-connectors-cli-first-design (Phase 4 / Task 22).
 */

import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import type {
  AppListItem,
  AppNestedInstallation,
  ConnectorGroupListItem,
  ConnectorGroupNestedInstallation,
  ConnectorListItem,
} from '@/lib/use-connectors';

type RowVisualStatus = 'active' | 'error' | 'off' | 'pending';

interface ConnectorGroupCardProps {
  item: ConnectorListItem | ConnectorGroupListItem | AppListItem;
}

export function ConnectorGroupCard({ item }: ConnectorGroupCardProps): JSX.Element {
  if (item.kind === 'app') return <AppCard app={item} />;
  if (item.kind === 'connector_group') return <GroupCard group={item} />;
  return <SingleCard connector={item} />;
}

// ── shared building blocks ────────────────────────────────────────────────

function CardShell({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <article className="bg-panel border border-border-subtle flex flex-col min-w-0 overflow-hidden">
      {children}
    </article>
  );
}

function CardHeader({
  iconUrl,
  iconFallback,
  title,
  meta,
  counter,
}: {
  iconUrl: string | null;
  iconFallback: string;
  title: React.ReactNode;
  meta: string;
  counter: string;
}): JSX.Element {
  return (
    <header className="flex items-center gap-4 px-5 py-4 border-b border-border-subtle">
      <CardIcon iconUrl={iconUrl} fallback={iconFallback} />
      <div className="flex flex-col flex-1 min-w-0 gap-1">
        <span className="font-sans text-[18px] font-medium tracking-[-0.005em] leading-5 text-text-primary truncate">
          {title}
        </span>
        <span className="font-mono text-[11px] tracking-[0.08em] leading-3 uppercase text-gold truncate">
          {meta}
        </span>
      </div>
      <span className="shrink-0 font-mono text-[11px] tracking-[0.08em] leading-3 uppercase text-text-tertiary">
        {counter}
      </span>
      <Kebab label={typeof title === 'string' ? title : 'item'} />
    </header>
  );
}

function CardIcon({
  iconUrl,
  fallback,
}: {
  iconUrl: string | null;
  fallback: string;
}): JSX.Element {
  if (iconUrl) {
    return (
      <span className="shrink-0 w-10 h-10 inline-flex items-center justify-center bg-panel-2 border border-gold-line rounded-[6px]">
        <img src={iconUrl} alt="" width={22} height={22} />
      </span>
    );
  }
  return (
    <span className="shrink-0 w-10 h-10 inline-flex items-center justify-center bg-panel-2 border border-gold-line rounded-[6px] font-mono text-base font-semibold leading-[18px] text-gold">
      {fallback.slice(0, 1).toUpperCase()}
    </span>
  );
}

function Kebab({ label }: { label: string }): JSX.Element {
  return (
    <button
      type="button"
      aria-label={`Actions for ${label}`}
      // The card-level kebab is visual-only on the index — drill rows route
      // to the catalog page where the per-instance menu lives. We render the
      // glyph so the component matches A1 exactly.
      onClick={(e) => e.preventDefault()}
      className="shrink-0 w-6 h-6 inline-flex items-center justify-center font-mono text-xs leading-4 text-text-tertiary hover:text-text-primary"
    >
      ⋯
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

// ── variant: single connector ─────────────────────────────────────────────

function SingleCard({ connector }: { connector: ConnectorListItem }): JSX.Element {
  // Spec 2026-05-08-connectors-cli-first-design: a count=1 row does NOT mean
  // the catalog is single-instance — multi-instance catalogs simply might
  // have just one row installed. The catalog's actual `multiInstance` field
  // is not surfaced on ConnectorListItem here, so we omit any tag that would
  // mislabel multi-instance catalogs as single-instance. The CatalogModal
  // owns the disabled "+" indicator for actual single-instance catalogs.
  const meta = formatMeta({
    description: connector.description,
    source: connector.source,
    transport: connector.transport,
  });
  const counter = '1 instance';
  return (
    <CardShell>
      <CardHeader
        iconUrl={connector.iconUrl}
        iconFallback={connector.displayName}
        title={connector.displayName}
        meta={meta}
        counter={counter}
      />
      <PlainInstanceRow connector={connector} last />
    </CardShell>
  );
}

// ── variant: connector_group (multi-instance plain) ───────────────────────

function GroupCard({ group }: { group: ConnectorGroupListItem }): JSX.Element {
  const sample = group.installations[0];
  const meta = formatMeta({
    description: null,
    source: 'catalog',
    transport: null,
    extraTags: ['catalog'],
  });
  const counter = `${group.installationCount} ${
    group.installationCount === 1 ? 'instance' : 'instances'
  }`;
  return (
    <CardShell>
      <CardHeader
        iconUrl={group.iconUrl}
        iconFallback={group.name}
        title={group.name}
        meta={
          // The API doesn't propagate the catalog `description` on the group
          // entry. Show the catalog id as the meta hint when no description
          // is available — the catalog leaves page handles the full copy.
          sample?.displayName ? `${group.catalogId} · catalog · plain` : meta
        }
        counter={counter}
      />
      <div className="flex flex-col">
        {group.installations.map((inst, i) => (
          <GroupInstanceRow
            key={inst.connectorId}
            catalogId={group.catalogId}
            installation={inst}
            last={i === group.installations.length - 1}
          />
        ))}
      </div>
    </CardShell>
  );
}

// ── variant: app ──────────────────────────────────────────────────────────

function AppCard({ app }: { app: AppListItem }): JSX.Element {
  const meta = `multi-installation ${app.catalogId} access · catalog · stdio`;
  const counter = `${app.installationCount} ${
    app.installationCount === 1 ? 'installation' : 'installations'
  }`;
  return (
    <CardShell>
      <CardHeader
        iconUrl={app.iconUrl}
        iconFallback={app.appName}
        title={
          <>
            {app.catalogId === 'github-app' ? 'github-app' : app.catalogId}{' '}
            <span className="text-text-tertiary">·</span>{' '}
            <span className="text-gold">{app.appName}</span>
          </>
        }
        meta={meta}
        counter={counter}
      />
      <AppIdentitySlot app={app} />
      <div className="flex flex-col">
        {app.installations.map((inst, i) => (
          <AppInstallationRow
            key={inst.connectorId}
            catalogId={app.catalogId}
            appUuid={app.appUuid}
            installation={inst}
            last={i === app.installations.length - 1}
          />
        ))}
      </div>
    </CardShell>
  );
}

function AppIdentitySlot({ app }: { app: AppListItem }): JSX.Element {
  // Compact PEM fingerprint placeholder. The list endpoint doesn't carry the
  // PEM SHA today (it lives on the App detail), so render a stable masked
  // ellipsis here — the App detail (A6a) shows the real value. Same pattern
  // for App ID: surface what we have, omit what we don't.
  return (
    <div className="bg-canvas border-b border-border-subtle px-5 py-3 flex items-center gap-8">
      <IdentityCol label="app" value={app.appName} valueClass="text-gold" />
      <IdentityCol label="app id" value={app.appId || '—'} />
      <IdentityCol label="pem fingerprint" value="—" />
      <Link
        to="/connectors/$catalogId/$id"
        params={{ catalogId: app.catalogId, id: app.appUuid }}
        className="ml-auto shrink-0 font-mono text-[10px] tracking-[0.1em] leading-3 uppercase text-text-secondary hover:text-text-primary transition-colors duration-[120ms]"
      >
        view app →
      </Link>
    </div>
  );
}

function IdentityCol({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="font-mono text-[9px] tracking-[0.18em] leading-3 uppercase text-text-tertiary">
        {label}
      </span>
      <span
        className={`font-mono text-[12px] leading-4 truncate ${valueClass ?? 'text-text-primary'}`}
      >
        {value}
      </span>
    </div>
  );
}

// ── drill rows ────────────────────────────────────────────────────────────

function PlainInstanceRow({
  connector,
  last,
}: {
  connector: ConnectorListItem;
  last: boolean;
}): JSX.Element {
  const status = visualStatusFromConnector(connector);
  const lastVerifiedLabel = formatLastVerified(
    connector.lastVerifiedAt,
    connector.status === 'pending',
  );
  const muted = connector.status === 'disabled';
  const label = connector.instanceLabel ?? connector.displayName;
  return (
    <Link
      to="/connectors/$catalogId/$id"
      params={{ catalogId: connector.catalogId ?? connector.slug, id: connector.id }}
      className={`flex items-center gap-4 px-5 py-3.5 ${
        last ? '' : 'border-b border-border-subtle'
      } transition-colors duration-[120ms] hover:bg-panel-2`}
    >
      <span
        className={`flex-1 min-w-0 font-mono text-[13px] leading-4 truncate ${
          muted ? 'text-text-secondary opacity-60' : 'text-text-primary'
        }`}
      >
        {label}
        {status === 'error' && connector.lastError && (
          <span className="block mt-1 font-mono text-[10px] tracking-[0.04em] leading-3 text-status-failed truncate">
            {connector.lastError}
          </span>
        )}
      </span>
      <span className="w-[100px] shrink-0 inline-flex">
        <StatusPill status={status} />
      </span>
      <span className="w-[80px] shrink-0 text-right font-mono text-[11px] leading-[14px] text-text-tertiary">
        {lastVerifiedLabel}
      </span>
      <Kebab label={label} />
    </Link>
  );
}

function GroupInstanceRow({
  catalogId,
  installation,
  last,
}: {
  catalogId: string;
  installation: ConnectorGroupNestedInstallation;
  last: boolean;
}): JSX.Element {
  const status = visualStatusFromInstallation(installation.status, installation.lastError);
  const lastVerifiedLabel = formatLastVerified(
    installation.lastVerifiedAt,
    installation.status === 'pending',
  );
  const muted = installation.status === 'disabled';
  const label = installation.instanceLabel ?? installation.displayName;
  return (
    <Link
      to="/connectors/$catalogId/$id"
      params={{ catalogId, id: installation.connectorId }}
      className={`flex items-center gap-4 px-5 py-3.5 ${
        last ? '' : 'border-b border-border-subtle'
      } transition-colors duration-[120ms] hover:bg-panel-2`}
    >
      <span
        className={`flex-1 min-w-0 font-mono text-[13px] leading-4 truncate ${
          muted ? 'text-text-secondary opacity-60' : 'text-text-primary'
        }`}
      >
        {label}
      </span>
      <span className="w-[100px] shrink-0 inline-flex">
        <StatusPill status={status} />
      </span>
      <span className="w-[80px] shrink-0 text-right font-mono text-[11px] leading-[14px] text-text-tertiary">
        {lastVerifiedLabel}
      </span>
      <Kebab label={label} />
    </Link>
  );
}

function AppInstallationRow({
  catalogId,
  appUuid,
  installation,
  last,
}: {
  catalogId: string;
  appUuid: string;
  installation: AppNestedInstallation;
  last: boolean;
}): JSX.Element {
  const status = visualStatusFromInstallation(installation.status, installation.lastError);
  const lastVerifiedLabel = formatLastVerified(
    installation.lastVerifiedAt,
    installation.status === 'pending',
  );
  const muted = installation.status === 'disabled';
  return (
    <Link
      to="/connectors/$catalogId/$appId/instances/$instanceId"
      params={{ catalogId, appId: appUuid, instanceId: installation.connectorId }}
      className={`flex items-center gap-4 px-5 py-3.5 ${
        last ? '' : 'border-b border-border-subtle'
      } transition-colors duration-[120ms] hover:bg-panel-2`}
    >
      <span
        className={`flex-1 min-w-0 font-mono text-[13px] leading-4 truncate ${
          muted ? 'text-text-secondary opacity-60' : 'text-text-primary'
        }`}
      >
        {installation.displayName}
      </span>
      <span className="w-[100px] shrink-0 inline-flex">
        <StatusPill status={status} />
      </span>
      <span className="w-[80px] shrink-0 text-right font-mono text-[11px] leading-[14px] text-text-tertiary">
        {lastVerifiedLabel}
      </span>
      <Kebab label={installation.displayName} />
    </Link>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────

function formatMeta({
  description,
  source,
  transport,
  extraTags = [],
}: {
  description: string | null;
  source: string;
  transport: string | null;
  extraTags?: string[];
}): string {
  const parts: string[] = [];
  if (description) parts.push(description);
  parts.push(source);
  if (transport) parts.push(transport);
  for (const t of extraTags) parts.push(t);
  return parts.join(' · ');
}

function visualStatusFromConnector(c: ConnectorListItem): RowVisualStatus {
  if (c.status === 'enabled') return c.lastError ? 'error' : 'active';
  if (c.status === 'disabled') return 'off';
  return 'pending';
}

function visualStatusFromInstallation(
  status: 'enabled' | 'disabled' | 'pending',
  lastError: string | null,
): RowVisualStatus {
  if (status === 'enabled') return lastError ? 'error' : 'active';
  if (status === 'disabled') return 'off';
  return 'pending';
}

function formatLastVerified(iso: string | null, pending: boolean): string {
  if (!iso) return pending ? 'never tested' : '—';
  return formatRelative(iso);
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
