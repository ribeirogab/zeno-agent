import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { AboutRow } from '@/components/settings/about-row';
import { ActiveBackendSelector } from '@/components/settings/active-backend-selector';
import { AgentCapabilitiesSection } from '@/components/settings/agent-capabilities-section';
import { BackendCard } from '@/components/settings/backend-card';
import { ConfigureModal } from '@/components/settings/configure-modal';
import { ProfileFileRow } from '@/components/settings/profile-file-row';
import { TabStrip } from '@/components/settings/tab-strip';
import { UserMdEditor } from '@/components/settings/user-md-editor';
import { SettingsSectionSkeleton } from '@/components/skeletons/settings-section-skeleton';
import { type BackendListItem, useBackends, useSetActiveBackend } from '@/lib/use-backends';
import { useHealth } from '@/lib/use-health';
import { type SettingsSnapshot, useSettings } from '@/lib/use-settings';

// Spec 0067 A: settings page in 4 tabs. Default = `profile`. URL
// reflects the active tab via `?tab=` search param so each tab is
// deep-linkable. Unknown / missing values fall back to the default.
const TABS = ['profile', 'capabilities', 'backend', 'about'] as const;
type SettingsTab = (typeof TABS)[number];
const TAB_LABELS: Record<SettingsTab, string> = {
  profile: 'profile',
  capabilities: 'capabilities',
  backend: 'backend',
  about: 'about',
};

export interface SettingsSearch {
  tab: SettingsTab;
}

function isTab(value: unknown): value is SettingsTab {
  return typeof value === 'string' && (TABS as readonly string[]).includes(value);
}

export const Route = createFileRoute('/_authed/settings')({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    tab: isTab(search.tab) ? search.tab : 'profile',
  }),
  component: SettingsScreen,
});

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  return `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
}

function SettingsScreen(): JSX.Element {
  const q = useSettings();
  const health = useHealth();
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <>
      <DashboardTopstrip crumbs={[{ label: 'settings', current: true }]} />
      <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-30 flex flex-col gap-8 min-w-0">
        <Header />
        <TabStrip
          tabs={TABS.map((id) => ({ id, label: TAB_LABELS[id] }))}
          activeId={tab}
          onChange={(next) => {
            navigate({ search: { tab: next } });
          }}
        />
        {q.isLoading || !q.data ? (
          <SettingsSectionSkeleton title={tab} rows={3} />
        ) : (
          <TabContent tab={tab} data={q.data} uptime={health.data?.uptime} version="v0.3.1" />
        )}
      </div>
    </>
  );
}

function TabContent({
  tab,
  data,
  uptime,
  version,
}: {
  tab: SettingsTab;
  data: SettingsSnapshot;
  uptime: number | undefined;
  version: string;
}): JSX.Element {
  switch (tab) {
    case 'profile':
      return (
        <div className="flex flex-col gap-10">
          <UserMdEditor />
          <ReadOnlyProfileFilesSection files={data.profileFiles} />
        </div>
      );
    case 'capabilities':
      return <AgentCapabilitiesSection />;
    case 'backend':
      return <BackendSection backend={data.backend} />;
    case 'about':
      return <AboutSection backend={data.backend.name} uptime={uptime} version={version} />;
  }
}

// ─── Header ───────────────────────────────────────────────────────────────────

// Spec 0067 C: Restart Worker button + modal removed. The profile
// watcher hot-reloads on file changes and DB-managed connectors don't
// need a worker restart. For a hard reset, run docker compose restart
// from the host (documented on the about tab).
function Header(): JSX.Element {
  return (
    <header className="flex items-end justify-between gap-6 border-b border-border-subtle pb-6">
      <div className="flex flex-col flex-1">
        <span className="font-mono text-[11px] font-medium tracking-[0.18em] leading-[14px] uppercase text-gold">
          system
        </span>
        <h1 className="font-sans text-[32px] font-medium tracking-[-0.015em] leading-10 text-text-primary mt-2 m-0">
          settings
        </h1>
        <p className="mt-2.5 max-w-[640px] m-0 font-sans text-sm leading-[1.6] text-text-secondary">
          Mostly read-only. Configuration knobs live in <InlineCode>.env</InlineCode> and{' '}
          <InlineCode>profile/</InlineCode> — edit there and Zeno hot-reloads.
        </p>
      </div>
    </header>
  );
}

function InlineCode({ children }: { children: ReactNode }): JSX.Element {
  return (
    <span className="inline-block align-baseline bg-panel-2 border border-border-subtle px-1.5 py-px font-mono text-xs leading-[1.6] text-gold">
      {children}
    </span>
  );
}

// ─── Sections ────────────────────────────────────────────────────────────────

function Section({
  title,
  meta,
  children,
}: {
  title: string;
  meta: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
        <h2 className="font-sans text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary m-0">
          {title}
        </h2>
        <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
          {meta}
        </span>
      </div>
      {children}
    </section>
  );
}

function BackendSection(_props: { backend: SettingsSnapshot['backend'] }): JSX.Element {
  // Spec 0071: backend section now driven by /api/backends (encrypted DB,
  // multi-backend ready) rather than the old /settings static field. The
  // legacy `backend` snapshot from useSettings is kept as a parameter for
  // call-site compatibility but unused here.
  const q = useBackends();
  const setActive = useSetActiveBackend();
  const [configuringId, setConfiguringId] = useState<string | null>(null);

  if (q.isLoading || !q.data) {
    return (
      <Section title="backend" meta="loading...">
        <div className="bg-panel border border-border-subtle rounded-md p-5 h-32 animate-pulse" />
      </Section>
    );
  }

  const configuring: BackendListItem | undefined =
    configuringId !== null ? q.data.backends.find((b) => b.id === configuringId) : undefined;

  return (
    <>
      <Section
        title="active backend"
        meta={`${q.data.backends.length} of ${q.data.backends.length} installed · pluggable surface`}
      >
        <ActiveBackendSelector
          backends={q.data.backends}
          activeId={q.data.active_backend_id}
          onChange={(id) => setActive.mutate(id)}
        />
      </Section>
      <Section title="backends" meta="catalog · agent/backends-catalog.json">
        <div className="flex flex-col gap-3">
          {q.data.backends.map((b) => (
            <BackendCard
              key={b.id}
              backend={b}
              profileId={q.data.profile_id}
              onConfigure={() => setConfiguringId(b.id)}
            />
          ))}
          <div className="flex items-center gap-2.5 px-4 py-3.5 border border-dashed border-border-subtle rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary" />
            <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-text-tertiary">
              codex · gemini · future backends — same install + auth surface
            </span>
          </div>
        </div>
      </Section>
      {configuring ? (
        <ConfigureModal
          backend={configuring}
          open
          onOpenChange={(next) => {
            if (!next) setConfiguringId(null);
          }}
        />
      ) : null}
    </>
  );
}

// Spec 0067 B: USER.md is now editable inline (see <UserMdEditor>).
// Other profile files stay read-only — SOUL.md is committed identity,
// crons.yaml is legacy (manage via /crons).
function ReadOnlyProfileFilesSection({
  files,
}: {
  files: SettingsSnapshot['profileFiles'];
}): JSX.Element {
  const readOnly = files.filter((f) => f.path !== 'USER.md');
  return (
    <Section title="other profile files" meta="read-only · bind-mounted">
      <div className="bg-panel border border-border-subtle flex flex-col">
        {readOnly.length === 0 ? (
          <div className="px-5 py-4 font-mono text-xs text-text-tertiary">no files mounted.</div>
        ) : (
          readOnly.map((f, i) => (
            <ProfileFileRow key={f.path} file={f} last={i === readOnly.length - 1} />
          ))
        )}
      </div>
    </Section>
  );
}

function AboutSection({
  backend,
  uptime,
  version,
}: {
  backend: string;
  uptime: number | undefined;
  version: string;
}): JSX.Element {
  return (
    <Section title="about" meta="runtime">
      <div className="flex flex-col gap-3">
        <div className="bg-panel border border-border-subtle flex flex-col">
          <AboutRow label="dashboard" value={`vite · react · tanstack-router · ${version}`} />
          <AboutRow label="backend" value={backend} />
          <AboutRow label="uptime" value={uptime !== undefined ? formatUptime(uptime) : '—'} last />
        </div>
        {/* Spec 0067 C — replace the Restart Worker button copy. */}
        <div className="border-l-2 border-status-active/60 bg-status-active/[0.04] px-4 py-3 flex flex-col gap-1">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-status-active">
            hot-reload
          </span>
          <p className="m-0 font-sans text-[13px] leading-[1.5] text-text-secondary">
            Worker auto-reloads on profile changes. For a hard reset, run{' '}
            <InlineCode>docker compose restart</InlineCode> from the host.
          </p>
        </div>
      </div>
    </Section>
  );
}
