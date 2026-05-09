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
 * Mutating actions are out of scope here. The card *header* navigates to the
 * leaves list (`/connectors/:catalogId`) and each drill row navigates to the
 * corresponding instance / installation detail. The leaves list owns the
 * destructive surface (kebab → `<CommandModal>`); on the index we deliberately
 * don't render decorative kebabs — only the navigation affordances are real.
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
  to,
  iconUrl,
  iconFallback,
  title,
  meta,
  counter,
}: {
  /** TanStack Router target — clicking the card body navigates here. */
  to: { to: string; params: Record<string, string> };
  iconUrl: string | null;
  iconFallback: string;
  title: React.ReactNode;
  meta: string;
  counter: string;
}): JSX.Element {
  return (
    // The whole header is one big anchor so the operator can click anywhere
    // on the catalog name / meta / counter — not just the drill rows. This
    // matches A1 affordance (the entire card top is interactive).
    <Link
      // biome-ignore lint/suspicious/noExplicitAny: TanStack `to` is typed against
      // the generated route tree which doesn't see polymorphic targets.
      to={to.to as any}
      // biome-ignore lint/suspicious/noExplicitAny: see above.
      params={to.params as any}
      className="flex items-center gap-4 px-5 py-4 border-b border-border-subtle transition-colors duration-[120ms] hover:bg-panel-2"
    >
      <CardIcon iconUrl={iconUrl} fallback={iconFallback} />
      <div className="flex flex-col flex-1 min-w-0 gap-1.5">
        {/* A1: catalog name in lowercase Space Grotesk medium, catalog id-style.
            `leading-6` + small bottom padding gives descenders (p/y/g/q) room
            to render — `leading-5` was clipping them inside the truncate
            box. */}
        <span className="font-sans text-[18px] font-medium tracking-[-0.005em] leading-6 text-text-primary truncate lowercase pb-0.5">
          {title}
        </span>
        {/* A1: meta line in lowercase mono with light tracking, text-secondary */}
        <span className="font-mono text-[11px] tracking-[0.04em] leading-4 text-text-secondary truncate">
          {meta}
        </span>
      </div>
      {/* A1: counter in lowercase mono small caps tracking, text-secondary */}
      <span className="shrink-0 font-mono text-[11px] tracking-[0.04em] leading-3 text-text-secondary">
        {counter}
      </span>
    </Link>
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
    // Real catalog icons (PNG/SVG) often render as dark glyphs on transparent
    // backgrounds — github's mark in particular disappears on the dark `panel-2`
    // tile. Use the off-white text-primary token as the tile background so any
    // logo (light or dark, color or mono) reads with full contrast. The 4px
    // inner padding keeps the logo from hugging the rounded corners.
    return (
      <span className="shrink-0 w-10 h-10 inline-flex items-center justify-center bg-text-primary rounded-[6px] p-1">
        <img src={iconUrl} alt="" className="max-w-full max-h-full" />
      </span>
    );
  }
  // Initials fallback keeps the dark tile + gold accent — used for connectors
  // without an icon URL (e.g. Klaviyo "K" tile in the artboard).
  return (
    <span className="shrink-0 w-10 h-10 inline-flex items-center justify-center bg-panel-2 border border-gold-line rounded-[6px] font-mono text-base font-semibold leading-[18px] text-gold">
      {fallback.slice(0, 1).toUpperCase()}
    </span>
  );
}

function StatusPill({ status }: { status: RowVisualStatus }): JSX.Element {
  // A1: minimal dot + lowercase label, no chip background or border.
  const config = {
    active: { dot: 'bg-status-active', text: 'text-text-primary', label: 'active' },
    error: { dot: 'bg-status-failed', text: 'text-status-failed', label: 'error' },
    off: { dot: 'bg-gold', text: 'text-text-secondary', label: 'off' },
    pending: { dot: 'bg-gold', text: 'text-gold', label: 'pending' },
  }[status];
  return (
    <span
      className={`inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.04em] leading-3 ${config.text}`}
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
        to={{
          to: '/connectors/$catalogId',
          params: { catalogId: connector.catalogId ?? connector.slug },
        }}
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
        to={{ to: '/connectors/$catalogId', params: { catalogId: group.catalogId } }}
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
  // A1 — App card title is the catalog id alone (lowercase). The App name
  // (e.g. "Acme Corp App") shows in the identity slot below as a gold accent.
  const meta = `multi-installation ${app.catalogId} access · catalog · stdio`;
  const counter = `${app.installationCount} ${
    app.installationCount === 1 ? 'installation' : 'installations'
  }`;
  return (
    <CardShell>
      <CardHeader
        // App card header drills to the App detail (A6a — `/connectors/<catalogId>/<appUuid>`),
        // not the catalog leaves list — apps don't have a plain leaves view.
        to={{
          to: '/connectors/$catalogId/$id',
          params: { catalogId: app.catalogId, id: app.appUuid },
        }}
        iconUrl={app.iconUrl}
        iconFallback={app.appName}
        title={app.catalogId}
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
  // Spec A1: identity slot inside the App card (only present on app-pattern,
  // not on plain connector cards). Renders the App identity (name in gold,
  // app_id, PEM fingerprint) plus a "view app →" link to the full detail.
  return (
    <div className="bg-canvas border-b border-border-subtle px-5 py-3 flex items-center gap-8">
      <IdentityCol label="app" value={app.appName} valueClass="text-gold" />
      <IdentityCol label="app id" value={app.appId || '—'} />
      <IdentityCol label="pem fingerprint" value={formatPemFingerprint(app.pemSha256)} />
      <Link
        to="/connectors/$catalogId/$id"
        params={{ catalogId: app.catalogId, id: app.appUuid }}
        className="ml-auto shrink-0 font-mono text-[11px] tracking-[0.04em] leading-3 text-text-secondary hover:text-text-primary transition-colors duration-[120ms]"
      >
        view app →
      </Link>
    </div>
  );
}

/**
 * A1 visual: render `pemSha256` (64-char hex) as `sha256:a3f9·c4b2·9f8d` —
 * three groups of four hex chars from the head, joined by middle-dots so the
 * fingerprint reads at a glance without overflowing the slot.
 */
function formatPemFingerprint(sha256?: string | null): string {
  if (!sha256) return '—';
  const head = sha256.slice(0, 12);
  const a = head.slice(0, 4);
  const b = head.slice(4, 8);
  const c = head.slice(8, 12);
  return `sha256:${a}·${b}·${c}`;
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
        className={`flex-1 min-w-0 font-sans text-[14px] leading-5 truncate ${
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
        className={`flex-1 min-w-0 font-sans text-[14px] leading-5 truncate ${
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
        className={`flex-1 min-w-0 font-sans text-[14px] leading-5 truncate ${
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
  // A1 keeps the timestamp column even on rows that don't have one yet —
  // we used to render an em-dash placeholder, but the operator complained it
  // looked like a non-functional UI affordance, so we now leave it blank when
  // there's nothing to show. Pending installs still surface "never tested" so
  // the operator can tell the row hasn't been health-checked yet.
  if (!iso) return pending ? 'never tested' : '';
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
