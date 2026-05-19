/**
 * `/connectors/:catalogId/:appId/instances/:instanceId` — App installation
 * detail (artboard A6b).
 *
 * Spec: .vault/specs/2026-05-08-connectors-cli-first-design (Task 21).
 *
 * Same skeleton as the plain instance detail (A5: status strip + secrets +
 * tools + activity) plus an App-aware breadcrumb (`zeno / connectors /
 * github-app / <app-slug> / instances / <installation-slug>`) and an
 * inheritance hint in both the description and the secrets section caption
 * ("inherits PEM from <App name>"). Every mutating button opens
 * `<CommandModal>` with the equivalent `zeno connector …` command — the
 * dashboard is read-only under `ZENO_API_WRITES=cli` (the default).
 */

import { createFileRoute } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useState } from 'react';
import { CommandModal } from '@/components/command-modal';
import {
  ActionButton,
  ActivitySection,
  InstanceDetailShell,
  InstanceHeader,
  SecretsSection,
  StatusStrip,
  ToolsSection,
  visualStatus,
} from '@/components/connectors/instance-detail-parts';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import type { CommandKind } from '@/lib/build-cli-command';
import { useAppDetail } from '@/lib/use-app-detail';
import { type ConnectorDetail, useConnector, useConnectorActivity } from '@/lib/use-connectors';

export const Route = createFileRoute('/_authed/connectors/$catalogId/$appId/instances/$instanceId')(
  {
    component: AppInstallationDetailScreen,
  },
);

function AppInstallationDetailScreen(): JSX.Element {
  const { catalogId, appId, instanceId } = Route.useParams();
  const connector = useConnector(instanceId);
  const activity = useConnectorActivity(instanceId);
  const app = useAppDetail(appId);
  const [command, setCommand] = useState<CommandKind | null>(null);

  if (connector.error) {
    return (
      <SimpleShell catalogId={catalogId} crumbs={[]}>
        <div className="bg-status-failed/[0.06] border border-status-failed/30 text-status-failed px-4 py-3 font-mono text-[11px]">
          failed to load installation — it may have been removed
        </div>
      </SimpleShell>
    );
  }
  if (!connector.data) {
    return (
      <SimpleShell catalogId={catalogId} crumbs={[]}>
        <p className="font-mono text-[11px] text-text-tertiary">loading…</p>
      </SimpleShell>
    );
  }

  const c = connector.data;
  const status = visualStatus(c);
  const enabled = c.status === 'enabled';
  const cleanName = (c.instanceLabel ?? c.displayName).replace(/^GitHub App — /, '');
  const appName = app.data?.app.appName ?? 'App';
  const appSlug = app.data?.app.appSlug ?? appId;
  const installationLabel = c.instanceLabel ?? cleanName;
  const installationSlug = slugify(cleanName);
  // Spec 2026-05-08 A6b description: "GitHub App installation · organization ·
  // N repos · inherits PEM from <App>". The connector record doesn't yet
  // expose the account type ("organization"/"user") or repos count, so we
  // surface the parts we have and fall back to "inherits PEM from <App>".
  const description = `GitHub App installation · ${c.toolCount} tools · inherits PEM from ${appName}`;
  const installationCaption = `${c.secrets.length || 1} secret${
    c.secrets.length === 1 ? '' : 's'
  } · inherits PEM from App`;

  return (
    <InstanceDetailShell
      crumbs={[
        { label: 'connectors', to: '/connectors' },
        { label: catalogId, to: `/connectors/${catalogId}` },
        { label: appSlug, to: `/connectors/${catalogId}/${appId}` },
        { label: 'instances' },
        { label: installationSlug, current: true },
      ]}
    >
      <InstanceHeader
        kicker={`INSTALLATION · ${catalogId.toUpperCase()}`}
        title={installationLabel}
        description={description}
        status={status}
        actions={
          <InstallationHeaderActions connector={c} enabled={enabled} onCommand={setCommand} />
        }
      />
      <StatusStrip connector={c} status={status} />
      <SecretsSection connector={c} onCommand={setCommand} summaryOverride={installationCaption} />
      <ToolsSection connector={c} onCommand={setCommand} />
      <ActivitySection feed={activity.data ?? []} loading={activity.isLoading} />
      {command && <CommandModal spec={command} onClose={() => setCommand(null)} />}
    </InstanceDetailShell>
  );
}

function InstallationHeaderActions({
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

function SimpleShell({
  catalogId,
  crumbs,
  children,
}: {
  catalogId: string;
  crumbs: Array<{ label: string; to?: string; current?: boolean }>;
  children: React.ReactNode;
}): JSX.Element {
  const fallback =
    crumbs.length > 0
      ? crumbs
      : [
          { label: 'connectors', to: '/connectors' },
          { label: catalogId, to: `/connectors/${catalogId}` },
          { label: '…', current: true },
        ];
  return (
    <div className="flex min-h-screen bg-canvas">
      <main className="flex-1 flex flex-col overflow-auto">
        <DashboardTopstrip crumbs={fallback} />
        <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-20 flex flex-col gap-8 min-w-0">
          {children}
        </div>
      </main>
    </div>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
