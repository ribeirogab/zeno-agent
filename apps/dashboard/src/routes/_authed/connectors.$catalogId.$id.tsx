/**
 * `/connectors/:catalogId/:id` — instance detail (artboards A5 + A6a).
 *
 * Spec: .vault/specs/2026-05-08-connectors-cli-first-design (Tasks 20 + 21).
 *
 * The route is a single entry point for two record kinds:
 *   - Plain instance (`kind: 'connector'`) — renders artboard A5 (status strip,
 *     secrets, tools, activity).
 *   - App entity (`kind: 'app'`, e.g. github-app) — renders artboard A6a
 *     (4-column app identity card + installations table).
 *
 * Detection: the dashboard list endpoint already returns both kinds, so we
 * consult `useConnectors()` to decide whether `:id` is an `appUuid` (App) or
 * a connector id (instance). When the list is loading we render a skeleton;
 * when it resolves we fetch the matching detail endpoint.
 *
 * Every mutating button opens `<CommandModal>` with the equivalent
 * `zeno connector …` command — the dashboard is read-only under
 * `ZENO_API_WRITES=cli` (the default).
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useState } from 'react';
import { CommandModal } from '@/components/command-modal';
import {
  ActionButton,
  ActivitySection,
  type Crumb,
  formatRelative,
  InstanceDetailShell,
  InstanceHeader,
  SecretsSection,
  StatusStrip,
  ToolsSection,
  visualStatus,
} from '@/components/connectors/instance-detail-parts';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import type { CommandKind } from '@/lib/build-cli-command';
import { type AppDetail, useAppDetail } from '@/lib/use-app-detail';
import {
  type ConnectorDetail,
  type ConnectorListEntry,
  useConnector,
  useConnectorActivity,
  useConnectors,
} from '@/lib/use-connectors';

export const Route = createFileRoute('/_authed/connectors/$catalogId/$id')({
  component: ConnectorDetailScreen,
});

function ConnectorDetailScreen(): JSX.Element {
  const { catalogId, id } = Route.useParams();
  const list = useConnectors();
  const matchedAppEntry = (list.data ?? []).find(
    (entry): entry is Extract<ConnectorListEntry, { kind: 'app' }> =>
      entry.kind === 'app' && entry.appUuid === id,
  );
  const isApp = matchedAppEntry !== undefined;

  if (list.isLoading) {
    return (
      <SimpleShell catalogId={catalogId} breadcrumbLabel="…">
        <p className="font-mono text-[11px] text-text-tertiary">loading…</p>
      </SimpleShell>
    );
  }

  if (isApp) {
    return <AppDetailView catalogId={catalogId} appUuid={id} />;
  }

  return <PlainInstanceView catalogId={catalogId} id={id} />;
}

// ── Plain instance view (A5) ──────────────────────────────────────────────────

function PlainInstanceView({ catalogId, id }: { catalogId: string; id: string }): JSX.Element {
  const connector = useConnector(id);
  const activity = useConnectorActivity(id);
  const [command, setCommand] = useState<CommandKind | null>(null);

  if (connector.error) {
    return (
      <SimpleShell catalogId={catalogId} breadcrumbLabel="error">
        <div className="bg-status-failed/[0.06] border border-status-failed/30 text-status-failed px-4 py-3 font-mono text-[11px]">
          failed to load instance — it may have been uninstalled
        </div>
      </SimpleShell>
    );
  }
  if (!connector.data) {
    return (
      <SimpleShell catalogId={catalogId} breadcrumbLabel="…">
        <p className="font-mono text-[11px] text-text-tertiary">loading…</p>
      </SimpleShell>
    );
  }

  const c = connector.data;
  const title = c.instanceLabel ?? c.displayName;
  const status = visualStatus(c);
  const enabled = c.status === 'enabled';
  const kicker = `instance · ${c.catalogId ?? 'custom'}`;
  const description = `${c.transport} instance · slug: ${c.slug}${
    c.catalogId ? ` · catalog: ${c.catalogId}` : ''
  }`;

  return (
    <InstanceDetailShell
      crumbs={[
        { label: 'connectors', to: '/connectors' },
        { label: catalogId, to: `/connectors/${catalogId}` },
        { label: c.slug, current: true },
      ]}
    >
      <InstanceHeader
        kicker={kicker}
        title={title}
        description={description}
        status={status}
        actions={<InstanceHeaderActions connector={c} enabled={enabled} onCommand={setCommand} />}
      />
      <StatusStrip connector={c} status={status} />
      <SecretsSection connector={c} onCommand={setCommand} />
      <ToolsSection connector={c} onCommand={setCommand} />
      <ActivitySection feed={activity.data ?? []} loading={activity.isLoading} />
      {command && <CommandModal spec={command} onClose={() => setCommand(null)} />}
    </InstanceDetailShell>
  );
}

function InstanceHeaderActions({
  connector,
  enabled,
  onCommand,
}: {
  connector: ConnectorDetail;
  enabled: boolean;
  onCommand: (cmd: CommandKind) => void;
}): JSX.Element {
  return (
    <>
      <ActionButton onClick={() => onCommand({ kind: 'test', slug: connector.slug })}>
        ▷ test
      </ActionButton>
      <ActionButton onClick={() => onCommand({ kind: 'refresh-tools', slug: connector.slug })}>
        ↻ refresh tools
      </ActionButton>
      <ActionButton
        onClick={() =>
          onCommand(
            enabled
              ? { kind: 'disable', slug: connector.slug }
              : { kind: 'enable', slug: connector.slug },
          )
        }
      >
        {enabled ? '◐ disable' : '○ enable'}
      </ActionButton>
      <ActionButton
        destructive
        onClick={() => onCommand({ kind: 'uninstall', slug: connector.slug })}
      >
        ⊟ uninstall
      </ActionButton>
    </>
  );
}

// ── App detail view (A6a) ────────────────────────────────────────────────────

function AppDetailView({
  catalogId,
  appUuid,
}: {
  catalogId: string;
  appUuid: string;
}): JSX.Element {
  const detail = useAppDetail(appUuid);
  const [command, setCommand] = useState<CommandKind | null>(null);

  if (detail.error) {
    return (
      <SimpleShell catalogId={catalogId} breadcrumbLabel="error">
        <div className="bg-status-failed/[0.06] border border-status-failed/30 text-status-failed px-4 py-3 font-mono text-[11px]">
          failed to load app — it may have been uninstalled
        </div>
      </SimpleShell>
    );
  }
  if (!detail.data) {
    return (
      <SimpleShell catalogId={catalogId} breadcrumbLabel="…">
        <p className="font-mono text-[11px] text-text-tertiary">loading…</p>
      </SimpleShell>
    );
  }

  const data = detail.data;
  const kicker = `APP · ${catalogId.toUpperCase()}`;
  const title = data.app.appName;
  const installCount = data.installations.length;
  const description = `App entity · single PEM, ${installCount} installation${
    installCount === 1 ? '' : 's'
  } across orgs/users.`;

  const crumbs: Crumb[] = [
    { label: 'connectors', to: '/connectors' },
    { label: catalogId, to: `/connectors/${catalogId}` },
    { label: data.app.appSlug, current: true },
  ];

  return (
    <InstanceDetailShell crumbs={crumbs}>
      <AppHeader
        detail={data}
        kicker={kicker}
        title={title}
        description={description}
        onCommand={setCommand}
      />
      <AppIdentityCard detail={data} />
      <InstallationsSection
        catalogId={catalogId}
        appUuid={appUuid}
        detail={data}
        onCommand={setCommand}
      />
      {command && <CommandModal spec={command} onClose={() => setCommand(null)} />}
    </InstanceDetailShell>
  );
}

function AppHeader({
  detail,
  kicker,
  title,
  description,
  onCommand,
}: {
  detail: AppDetail;
  kicker: string;
  title: string;
  description: string;
  onCommand: (cmd: CommandKind) => void;
}): JSX.Element {
  // Spec 0048 Q2: amber inline warning when refresh failed within the last hour.
  const refreshErrorAge = detail.app.lastRefreshErrorAt
    ? Date.now() - new Date(detail.app.lastRefreshErrorAt).getTime()
    : null;
  const isDegraded = refreshErrorAge !== null && refreshErrorAge < 60 * 60_000;
  return (
    <header className="flex flex-col gap-3 border-b border-border-subtle pb-6">
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col flex-1 min-w-0">
          <span className="font-mono text-[11px] font-medium tracking-[0.18em] leading-[14px] uppercase text-gold">
            {kicker}
          </span>
          <h1 className="font-sans text-[32px] font-medium tracking-[-0.015em] leading-10 text-text-primary mt-2 m-0">
            {title}
          </h1>
          <p className="mt-2.5 max-w-[620px] m-0 font-sans text-sm leading-[1.6] text-text-secondary">
            {description}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ActionButton onClick={() => onCommand({ kind: 'app-installations-discover' })}>
            ⚲ discover
          </ActionButton>
          <ActionButton
            onClick={() =>
              onCommand({ kind: 'app-installations-add', installationId: '', label: '' })
            }
          >
            + add installation
          </ActionButton>
          <ActionButton
            destructive
            onClick={() => onCommand({ kind: 'app-uninstall', appName: detail.app.appName })}
          >
            ⊟ uninstall app
          </ActionButton>
        </div>
      </div>
      {isDegraded && (
        <div className="flex items-start gap-2 max-w-[620px] px-3 py-2 bg-[#C99F4F]/10 border border-[#C99F4F]/40 border-l-2 border-l-[#C99F4F]">
          <span className="font-mono text-xs leading-4 text-[#C99F4F]">⚠</span>
          <span
            className="flex-1 font-mono text-[11px] leading-[15px] text-text-primary"
            title={detail.app.lastRefreshErrorMessage ?? undefined}
          >
            token refresh failing — last error at{' '}
            {formatRelative(detail.app.lastRefreshErrorAt as string)}
            {detail.app.lastRefreshErrorMessage
              ? `: ${detail.app.lastRefreshErrorMessage.slice(0, 100)}`
              : ''}
          </span>
        </div>
      )}
    </header>
  );
}

function AppIdentityCard({ detail }: { detail: AppDetail }): JSX.Element {
  const lastRefresh = detail.app.lastRefreshErrorAt
    ? `failed · ${formatRelative(detail.app.lastRefreshErrorAt)}`
    : `passed · ${formatRelative(detail.app.updatedAt)}`;
  const lastRefreshAccent = detail.app.lastRefreshErrorAt ? 'text-status-failed' : 'text-gold';
  // PEM fingerprint in 4-char chunks separated by middle-dots for visual scannability.
  const fingerprint =
    detail.app.pemSha256
      .match(/.{1,4}/g)
      ?.slice(0, 6)
      .join('·') ?? detail.app.pemSha256;

  return (
    <div className="bg-panel border border-border-subtle grid grid-cols-4 divide-x divide-border-subtle">
      <IdentityCell label="app id" value={detail.app.appId} />
      <IdentityCell label="app slug" value={detail.app.appSlug} />
      <IdentityCell label="pem fingerprint" value={`sha256:${fingerprint}…`} />
      <IdentityCell label="last refresh" value={lastRefresh} accent={lastRefreshAccent} />
    </div>
  );
}

function IdentityCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}): JSX.Element {
  return (
    <div className="px-4 py-3 flex flex-col gap-1.5">
      <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
        {label}
      </span>
      <span className={`font-mono text-[13px] leading-4 ${accent ?? 'text-text-primary'} truncate`}>
        {value}
      </span>
    </div>
  );
}

function InstallationsSection({
  catalogId,
  appUuid,
  detail,
  onCommand,
}: {
  catalogId: string;
  appUuid: string;
  detail: AppDetail;
  onCommand: (cmd: CommandKind) => void;
}): JSX.Element {
  const total = detail.installations.length;
  const activeCount = detail.installations.filter((i) => i.status === 'enabled').length;
  const summary =
    total === 0
      ? 'no installations'
      : `${total} installation${total === 1 ? '' : 's'} · ${activeCount} active`;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
        <h2 className="m-0 font-sans text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
          installations
        </h2>
        <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
          {summary}
        </span>
      </div>
      {total === 0 ? (
        <div className="bg-panel border border-border-subtle px-6 py-8 flex flex-col items-center gap-1 text-center">
          <span className="font-sans text-[13px] leading-[1.6] text-text-secondary">
            No installations yet. Run{' '}
            <span className="font-mono text-gold">
              zeno connector app installations add --installation-id …
            </span>{' '}
            to add one.
          </span>
        </div>
      ) : (
        <div className="bg-panel border border-border-subtle flex flex-col">
          {detail.installations.map((inst, i) => (
            <InstallationRow
              key={inst.connectorId}
              catalogId={catalogId}
              appUuid={appUuid}
              installation={inst}
              last={i === total - 1}
              onCommand={onCommand}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function InstallationRow({
  catalogId,
  appUuid,
  installation,
  last,
  onCommand,
}: {
  catalogId: string;
  appUuid: string;
  installation: AppDetail['installations'][number];
  last: boolean;
  onCommand: (cmd: CommandKind) => void;
}): JSX.Element {
  const status =
    installation.status === 'enabled'
      ? installation.lastError
        ? 'error'
        : 'active'
      : installation.status === 'disabled'
        ? 'disabled'
        : 'pending';
  const lastVerifiedLabel = installation.lastVerifiedAt
    ? formatRelative(installation.lastVerifiedAt)
    : '—';
  const cleanName = installation.displayName.replace(/^GitHub App — /, '');
  return (
    <div
      className={`flex items-center gap-4 px-5 py-3.5 ${
        last ? '' : 'border-b border-border-subtle'
      } transition-colors duration-[120ms] hover:bg-panel-2`}
    >
      <Link
        to="/connectors/$catalogId/$appId/instances/$instanceId"
        params={{ catalogId, appId: appUuid, instanceId: installation.connectorId }}
        className="flex flex-1 min-w-0 flex-col gap-[2px]"
      >
        <span className="font-mono text-[13px] font-medium tracking-[0.02em] leading-4 text-text-primary truncate">
          {cleanName}
        </span>
        <span className="font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary truncate">
          installation {installation.installationId ?? '—'} · {installation.toolCount} tools
        </span>
      </Link>
      <span className="w-[100px] shrink-0 inline-flex">
        <RowStatusPill status={status} />
      </span>
      <span className="w-[80px] shrink-0 text-right font-mono text-[11px] leading-[14px] text-text-tertiary">
        {lastVerifiedLabel}
      </span>
      <button
        type="button"
        aria-label={`Actions for ${cleanName}`}
        onClick={() => onCommand({ kind: 'uninstall', slug: installation.slug })}
        className="w-7 h-7 inline-flex items-center justify-center font-mono text-xs text-text-tertiary hover:text-text-primary"
      >
        ⋯
      </button>
    </div>
  );
}

function RowStatusPill({
  status,
}: {
  status: 'active' | 'error' | 'disabled' | 'pending';
}): JSX.Element {
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
    disabled: {
      cls: 'bg-panel-2 border border-border-subtle text-text-tertiary',
      dot: 'bg-text-tertiary',
      label: 'disabled',
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

// ── Lightweight skeleton/error shell ─────────────────────────────────────────

function SimpleShell({
  catalogId,
  breadcrumbLabel,
  children,
}: {
  catalogId: string;
  breadcrumbLabel: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex min-h-screen bg-canvas">
      <main className="flex-1 flex flex-col overflow-auto">
        <DashboardTopstrip
          crumbs={[
            { label: 'connectors', to: '/connectors' },
            { label: catalogId, to: `/connectors/${catalogId}` },
            { label: breadcrumbLabel, current: true },
          ]}
        />
        <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-20 flex flex-col gap-8 min-w-0">
          {children}
        </div>
      </main>
    </div>
  );
}
