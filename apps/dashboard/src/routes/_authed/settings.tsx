import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import type { JSX, ReactNode } from 'react';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { AboutRow } from '@/components/settings/about-row';
import { AgentCapabilitiesSection } from '@/components/settings/agent-capabilities-section';
import { ProfileFileRow } from '@/components/settings/profile-file-row';
import { TabStrip } from '@/components/settings/tab-strip';
import { AgentsMdEditor } from '@/components/settings/agents-md-editor';
import { SettingsSectionSkeleton } from '@/components/skeletons/settings-section-skeleton';
import { useHealth } from '@/lib/use-health';
import { type SettingsSnapshot, useSettings } from '@/lib/use-settings';

// Spec 0072: BACKEND tab removed. Settings page now hosts profile +
// capabilities + about; backend lives at /backend (top-level).
const TABS = ['profile', 'capabilities', 'about'] as const;
type SettingsTab = (typeof TABS)[number];
const TAB_LABELS: Record<SettingsTab, string> = {
  profile: 'profile',
  capabilities: 'capabilities',
  about: 'about',
};

export interface SettingsSearch {
  tab: SettingsTab;
}

function isTab(value: unknown): value is SettingsTab {
  return typeof value === 'string' && (TABS as readonly string[]).includes(value);
}

export const Route = createFileRoute('/_authed/settings')({
  // Spec 0072 — legacy /settings?tab=backend → /backend. Check the raw search
  // BEFORE validateSearch normalizes it (validateSearch would coerce the
  // unknown `'backend'` value to the default `'profile'` and we'd never see
  // it in beforeLoad).
  beforeLoad: ({ location }) => {
    const params = new URLSearchParams(location.searchStr ?? '');
    if (params.get('tab') === 'backend') {
      throw redirect({ to: '/backend' });
    }
  },
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
          <AgentsMdEditor />
          <ReadOnlyProfileFilesSection files={data.profileFiles} />
        </div>
      );
    case 'capabilities':
      return <AgentCapabilitiesSection />;
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
        {/* Spec 0072 — copy replaced; backend tab moved to its own /backend page. */}
        <p className="mt-2.5 max-w-[640px] m-0 font-sans text-sm leading-[1.6] text-text-secondary">
          Edit AGENTS.md inline; flip capabilities. Worker auto-reloads on profile changes. Backend
          lives at <InlineCode>/backend</InlineCode>.
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

// Spec 2026-05-20: AGENTS.md is editable inline (see <AgentsMdEditor>).
// Other profile files stay read-only — SOUL.md is committed identity,
// crons.yaml is legacy (manage via /crons).
function ReadOnlyProfileFilesSection({
  files,
}: {
  files: SettingsSnapshot['profileFiles'];
}): JSX.Element {
  const readOnly = files.filter((f) => f.path !== 'AGENTS.md');
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
