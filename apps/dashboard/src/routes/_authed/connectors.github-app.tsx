/**
 * GitHub App detail page (C8). Spec 0045.
 *
 * Route file uses TanStack's flat-file dot notation with a literal segment
 * `github-app` — TanStack matches static segments BEFORE dynamic `$id`,
 * so this resolves before `connectors.$id.tsx` for the path
 * `/connectors/github-app`.
 */

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useState } from 'react';
import { GitHubAppAddInstallationModal } from '@/components/connectors/lifecycle-modals/github-app-add-installation-modal';
import { GitHubAppEditEnvVarModal } from '@/components/connectors/lifecycle-modals/github-app-edit-env-var-modal';
import { GitHubAppRemoveInstallationModal } from '@/components/connectors/lifecycle-modals/github-app-remove-installation-modal';
import { GitHubAppRotatePemModal } from '@/components/connectors/lifecycle-modals/github-app-rotate-pem-modal';
import { GitHubAppUninstallAppModal } from '@/components/connectors/lifecycle-modals/github-app-uninstall-app-modal';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { type AppDetail, useAppDetail } from '@/lib/use-app-detail';
import { useConnectors } from '@/lib/use-connectors';

type ModalKind =
  | { kind: 'add' }
  | { kind: 'rotate-pem' }
  | { kind: 'uninstall-app' }
  | { kind: 'remove-installation'; connectorId: string }
  | { kind: 'edit-env-var'; connectorId: string };

export const Route = createFileRoute('/_authed/connectors/github-app')({
  component: GitHubAppDetailScreen,
});

function GitHubAppDetailScreen(): JSX.Element {
  // We need the appUuid to fetch detail. Since the URL is just /connectors/github-app
  // (single-app v1), we look up the app from the listing.
  const list = useConnectors();
  const navigate = useNavigate();
  const appEntry = list.data?.find((e) => e.kind === 'app' && e.catalogId === 'github-app');
  const appUuid = appEntry && appEntry.kind === 'app' ? appEntry.appUuid : undefined;
  const detail = useAppDetail(appUuid);
  const [modal, setModal] = useState<ModalKind | null>(null);

  if (list.isLoading || (appUuid && detail.isLoading)) {
    return (
      <div className="flex min-h-screen bg-canvas">
        <main className="flex-1 flex flex-col overflow-auto">
          <DashboardTopstrip
            crumbs={[
              { label: 'connectors', to: '/connectors' },
              { label: 'github app', current: true },
            ]}
          />
          <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 font-mono text-xs text-text-tertiary">
            loading…
          </div>
        </main>
      </div>
    );
  }

  if (!appEntry) {
    // App not installed; route the user back to the catalog.
    return (
      <div className="flex min-h-screen bg-canvas">
        <main className="flex-1 flex flex-col overflow-auto">
          <DashboardTopstrip
            crumbs={[
              { label: 'connectors', to: '/connectors' },
              { label: 'github app', current: true },
            ]}
          />
          <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 flex flex-col gap-3">
            <h1 className="font-sans text-[28px] font-medium tracking-[-0.015em] leading-9 text-text-primary m-0">
              GitHub App not installed
            </h1>
            <p className="m-0 font-sans text-sm leading-6 text-text-secondary">
              Install the GitHub App from the catalog to manage organization installations.
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: '/connectors' })}
              className="self-start mt-2 inline-flex items-center px-3.5 py-2 border border-gold-line font-mono text-xs font-medium tracking-[0.06em] leading-4 uppercase text-gold hover:bg-gold-soft transition-colors duration-[120ms]"
            >
              browse catalog ↗
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!detail.data) {
    return (
      <div className="flex min-h-screen bg-canvas">
        <main className="flex-1 flex flex-col overflow-auto">
          <DashboardTopstrip
            crumbs={[
              { label: 'connectors', to: '/connectors' },
              { label: 'github app', current: true },
            ]}
          />
          <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 font-mono text-xs text-status-failed">
            failed to load app detail
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <main className="flex-1 flex flex-col overflow-auto">
        <DashboardTopstrip
          crumbs={[
            { label: 'connectors', to: '/connectors' },
            { label: 'github app', current: true },
          ]}
        />
        <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-20 flex flex-col gap-8 min-w-0">
          <Header detail={detail.data} onUninstall={() => setModal({ kind: 'uninstall-app' })} />
          <AppConfigSection
            detail={detail.data}
            onRotatePem={() => setModal({ kind: 'rotate-pem' })}
            onUninstall={() => setModal({ kind: 'uninstall-app' })}
          />
          <InstallationsSection
            detail={detail.data}
            onAdd={() => setModal({ kind: 'add' })}
            onRemove={(connectorId) => setModal({ kind: 'remove-installation', connectorId })}
            onEditEnvVar={(connectorId) => setModal({ kind: 'edit-env-var', connectorId })}
          />
          <Footnote />
        </div>
      </main>
      {modal?.kind === 'add' && appUuid && (
        <GitHubAppAddInstallationModal
          appUuid={appUuid}
          appName={detail.data.app.appName}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'rotate-pem' && appUuid && (
        <GitHubAppRotatePemModal
          appUuid={appUuid}
          appId={detail.data.app.appId}
          appName={detail.data.app.appName}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'uninstall-app' && appUuid && (
        <GitHubAppUninstallAppModal
          appUuid={appUuid}
          appName={detail.data.app.appName}
          installationCount={detail.data.installations.length}
          installationEnvVars={detail.data.installations
            .map((i) => i.envVar)
            .filter((v): v is string => v !== null)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'remove-installation' &&
        appUuid &&
        (() => {
          const inst = detail.data.installations.find((i) => i.connectorId === modal.connectorId);
          if (!inst) return null;
          return (
            <GitHubAppRemoveInstallationModal
              appUuid={appUuid}
              installation={{
                connectorId: inst.connectorId,
                displayName: inst.displayName,
                envVar: inst.envVar,
                toolCount: inst.toolCount,
              }}
              onClose={() => setModal(null)}
            />
          );
        })()}
      {modal?.kind === 'edit-env-var' &&
        appUuid &&
        (() => {
          const inst = detail.data.installations.find((i) => i.connectorId === modal.connectorId);
          if (!inst) return null;
          return (
            <GitHubAppEditEnvVarModal
              appUuid={appUuid}
              installation={{
                connectorId: inst.connectorId,
                displayName: inst.displayName,
                envVar: inst.envVar,
              }}
              onClose={() => setModal(null)}
            />
          );
        })()}
    </div>
  );
}

function Header({
  detail,
  onUninstall,
}: {
  detail: AppDetail;
  onUninstall: () => void;
}): JSX.Element {
  return (
    <header className="flex items-end justify-between gap-6 border-b border-border-subtle pb-6">
      <div className="flex flex-col flex-1">
        <span className="font-mono text-[11px] font-medium tracking-[0.18em] leading-[14px] uppercase text-gold">
          github · app
        </span>
        <h1 className="font-sans text-[32px] font-medium tracking-[-0.015em] leading-10 text-text-primary mt-2 m-0">
          {detail.app.appName}
        </h1>
        <p className="mt-2.5 max-w-[620px] m-0 font-sans text-sm leading-[1.6] text-text-secondary">
          One App, {detail.installations.length} installation
          {detail.installations.length === 1 ? '' : 's'}. Each installation gets its own token and
          tool permissions.
        </p>
      </div>
      <button
        type="button"
        onClick={onUninstall}
        className="font-mono text-[10px] tracking-[0.08em] uppercase text-status-failed hover:underline"
      >
        uninstall app
      </button>
    </header>
  );
}

function AppConfigSection({
  detail,
  onRotatePem,
  onUninstall,
}: {
  detail: AppDetail;
  onRotatePem: () => void;
  onUninstall: () => void;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
        <h2 className="m-0 font-sans text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
          app config
        </h2>
        <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
          shared across installations
        </span>
      </div>
      <div className="bg-panel border border-border-subtle p-5 flex flex-col gap-4">
        <ConfigField label="App ID" value={detail.app.appId} mono />
        <ConfigField label="Slug" value={detail.app.appSlug} mono />
        <PemField
          sha256={detail.app.pemSha256}
          rotatedAt={detail.app.pemRotatedAt}
          onRotate={onRotatePem}
          onUninstall={onUninstall}
        />
      </div>
    </section>
  );
}

function ConfigField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] tracking-[0.18em] leading-3 uppercase text-gold">
        {label}
      </span>
      <span
        className={`${mono ? 'font-mono' : 'font-sans'} text-[13px] leading-4 text-text-primary`}
      >
        {value}
      </span>
    </div>
  );
}

function PemField({
  sha256,
  rotatedAt,
  onRotate,
  onUninstall,
}: {
  sha256: string;
  rotatedAt: string | null;
  onRotate: () => void;
  onUninstall: () => void;
}): JSX.Element {
  // Display the fingerprint in 4-char chunks separated by middle-dots for
  // visual scannability. Spec 0045 (artboard C8 design).
  const chunked =
    sha256
      .match(/.{1,4}/g)
      ?.slice(0, 8)
      .join('·') ?? sha256;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] tracking-[0.18em] leading-3 uppercase text-gold">
        PEM
      </span>
      <span className="font-mono text-[13px] leading-4 text-text-primary">
        ••••••••••••••••
        <span className="ml-3 text-text-tertiary text-[11px]">fingerprint {chunked}…</span>
      </span>
      <div className="flex items-center gap-3 mt-1">
        <span className="font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary">
          {rotatedAt ? `rotated ${formatRelative(rotatedAt)}` : 'never rotated'}
        </span>
        <button
          type="button"
          onClick={onRotate}
          className="font-mono text-[10px] tracking-[0.08em] uppercase text-gold hover:underline"
        >
          rotate
        </button>
        <span className="text-text-tertiary text-[10px]">·</span>
        <button
          type="button"
          onClick={onUninstall}
          className="font-mono text-[10px] tracking-[0.08em] uppercase text-status-failed hover:underline"
        >
          uninstall app
        </button>
      </div>
    </div>
  );
}

function InstallationsSection({
  detail,
  onAdd,
  onRemove,
  onEditEnvVar,
}: {
  detail: AppDetail;
  onAdd: () => void;
  onRemove: (connectorId: string) => void;
  onEditEnvVar: (connectorId: string) => void;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
        <h2 className="m-0 font-sans text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
          installations
        </h2>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
            {detail.installations.length} active
          </span>
          <button
            type="button"
            onClick={onAdd}
            className="font-mono text-[10px] tracking-[0.08em] uppercase text-gold hover:underline"
          >
            + add installation
          </button>
        </div>
      </div>
      <div className="bg-panel border border-border-subtle flex flex-col min-w-0 overflow-x-auto">
        <div className="flex items-center gap-4 px-5 py-3 border-b border-border-subtle bg-sidebar font-mono text-[10px] tracking-[0.18em] leading-3 uppercase text-text-tertiary min-w-[820px]">
          <span className="flex-1 min-w-0">installation</span>
          <span className="w-[160px] shrink-0">env var</span>
          <span className="w-[100px] shrink-0">tools</span>
          <span className="w-[120px] shrink-0">last verified</span>
          <span className="w-[80px] shrink-0">actions</span>
        </div>
        {detail.installations.length === 0 ? (
          <div className="px-5 py-8 flex flex-col items-center gap-3">
            <span className="font-mono text-xs text-text-tertiary">No installations yet.</span>
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex items-center px-3.5 py-2 bg-gold border border-gold font-mono text-xs font-semibold tracking-[0.06em] leading-4 uppercase text-text-ink hover:bg-gold-bright hover:border-gold-bright transition-colors duration-[120ms]"
            >
              + add your first installation
            </button>
          </div>
        ) : (
          detail.installations.map((inst, i) => (
            <div
              key={inst.connectorId}
              className={`flex items-center gap-4 px-5 py-3.5 ${
                i === detail.installations.length - 1 ? '' : 'border-b border-border-subtle'
              } min-w-[820px] transition-colors duration-[120ms] hover:bg-panel-2`}
            >
              <Link
                to="/connectors/$id"
                params={{ id: inst.connectorId }}
                className="flex-1 min-w-0 flex flex-col gap-[2px] cursor-pointer"
              >
                <span className="font-mono text-[13px] font-medium tracking-[0.02em] leading-4 text-text-primary truncate">
                  {inst.displayName.replace(/^GitHub App — /, '')}
                </span>
                <span className="font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary truncate">
                  installation {inst.installationId ?? '—'}
                </span>
              </Link>
              <span className="w-[160px] shrink-0 font-mono text-[11px] leading-[14px] text-text-tertiary truncate">
                {inst.envVar ?? '—'}
              </span>
              <span className="w-[100px] shrink-0 font-mono text-[11px] leading-[14px] text-text-secondary">
                {inst.toolCount} tools
              </span>
              <span className="w-[120px] shrink-0 font-mono text-[11px] leading-[14px] text-text-tertiary">
                {inst.lastVerifiedAt ? formatRelative(inst.lastVerifiedAt) : 'never'}
              </span>
              <div className="w-[80px] shrink-0 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onEditEnvVar(inst.connectorId)}
                  className="font-mono text-[10px] tracking-[0.08em] uppercase text-gold hover:underline"
                  title="edit env var"
                >
                  edit
                </button>
                <span className="text-text-tertiary text-[10px]">·</span>
                <button
                  type="button"
                  onClick={() => onRemove(inst.connectorId)}
                  className="font-mono text-[10px] tracking-[0.08em] uppercase text-status-failed hover:underline"
                  title="remove installation"
                >
                  remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function Footnote(): JSX.Element {
  return (
    <p className="m-0 font-mono text-[11px] tracking-[0.04em] leading-4 text-text-tertiary">
      Each installation has its own tool permission set. Click an installation row to manage its
      tools.
    </p>
  );
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
