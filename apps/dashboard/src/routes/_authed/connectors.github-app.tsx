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
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { type AppDetail, useAppDetail } from '@/lib/use-app-detail';
import { useConnectors } from '@/lib/use-connectors';

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
          <Header detail={detail.data} />
          <AppConfigSection detail={detail.data} />
          <InstallationsSection detail={detail.data} />
          <Footnote />
        </div>
      </main>
    </div>
  );
}

function Header({ detail }: { detail: AppDetail }): JSX.Element {
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
    </header>
  );
}

function AppConfigSection({ detail }: { detail: AppDetail }): JSX.Element {
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
        <PemField sha256={detail.app.pemSha256} rotatedAt={detail.app.pemRotatedAt} />
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
}: {
  sha256: string;
  rotatedAt: string | null;
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
      <span className="font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary">
        {rotatedAt ? `rotated ${formatRelative(rotatedAt)}` : 'never rotated'}
        <span className="ml-3 text-gold">rotate · uninstall app</span>
      </span>
    </div>
  );
}

function InstallationsSection({ detail }: { detail: AppDetail }): JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
        <h2 className="m-0 font-sans text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
          installations
        </h2>
        <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
          {detail.installations.length} active
        </span>
      </div>
      <div className="bg-panel border border-border-subtle flex flex-col min-w-0 overflow-x-auto">
        <div className="flex items-center gap-4 px-5 py-3 border-b border-border-subtle bg-sidebar font-mono text-[10px] tracking-[0.18em] leading-3 uppercase text-text-tertiary min-w-[820px]">
          <span className="flex-1 min-w-0">installation</span>
          <span className="w-[160px] shrink-0">env var</span>
          <span className="w-[100px] shrink-0">tools</span>
          <span className="w-[120px] shrink-0">last verified</span>
        </div>
        {detail.installations.length === 0 ? (
          <div className="px-5 py-6 font-mono text-xs text-text-tertiary text-center">
            No installations yet. Lifecycle modals (M7-M12) ship in spec 0046.
          </div>
        ) : (
          detail.installations.map((inst, i) => (
            <Link
              key={inst.connectorId}
              to="/connectors/$id"
              params={{ id: inst.connectorId }}
              className={`flex items-center gap-4 px-5 py-3.5 ${
                i === detail.installations.length - 1 ? '' : 'border-b border-border-subtle'
              } min-w-[820px] cursor-pointer transition-colors duration-[120ms] hover:bg-panel-2`}
            >
              <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
                <span className="font-mono text-[13px] font-medium tracking-[0.02em] leading-4 text-text-primary truncate">
                  {inst.displayName.replace(/^GitHub App — /, '')}
                </span>
                <span className="font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary truncate">
                  installation {inst.installationId ?? '—'}
                </span>
              </div>
              <span className="w-[160px] shrink-0 font-mono text-[11px] leading-[14px] text-text-tertiary truncate">
                {inst.envVar ?? '—'}
              </span>
              <span className="w-[100px] shrink-0 font-mono text-[11px] leading-[14px] text-text-secondary">
                {inst.toolCount} tools
              </span>
              <span className="w-[120px] shrink-0 font-mono text-[11px] leading-[14px] text-text-tertiary">
                {inst.lastVerifiedAt ? formatRelative(inst.lastVerifiedAt) : 'never'}
              </span>
            </Link>
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
