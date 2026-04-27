import { createFileRoute } from '@tanstack/react-router';
import { type JSX, type ReactNode, useState } from 'react';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { RestartWorkerModal } from '@/components/modals/restart-worker-modal';
import { AboutRow } from '@/components/settings/about-row';
import { BackendCard } from '@/components/settings/backend-card';
import { ProfileFileRow } from '@/components/settings/profile-file-row';
import { SettingsSectionSkeleton } from '@/components/skeletons/settings-section-skeleton';
import { useRestartWorker } from '@/lib/mutations';
import { useHealth } from '@/lib/use-health';
import { type SettingsSnapshot, useSettings } from '@/lib/use-settings';

export const Route = createFileRoute('/_authed/settings')({
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
  const restartWorker = useRestartWorker();
  const [showRestart, setShowRestart] = useState(false);

  return (
    <>
      <DashboardTopstrip crumbs={[{ label: 'settings', current: true }]} />
      <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-30 flex flex-col gap-10 min-w-0">
        <Header onRestart={() => setShowRestart(true)} />
        {q.isLoading || !q.data ? (
          <>
            <SettingsSectionSkeleton title="backend" rows={1} />
            <SettingsSectionSkeleton title="mcp servers" rows={5} />
            <SettingsSectionSkeleton title="profile files" rows={5} />
            <SettingsSectionSkeleton title="about" rows={3} />
          </>
        ) : (
          <>
            <BackendSection backend={q.data.backend} />
            <ProfileFilesSection files={q.data.profileFiles} />
            <AboutSection
              backend={q.data.backend.name}
              uptime={health.data?.uptime}
              version="v0.3.1"
            />
          </>
        )}
      </div>
      <RestartWorkerModal
        open={showRestart}
        onOpenChange={setShowRestart}
        onConfirm={() => {
          restartWorker.mutate();
          setShowRestart(false);
        }}
      />
    </>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header({ onRestart }: { onRestart: () => void }): JSX.Element {
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
          Read-only view. Most knobs live in <InlineCode>.env</InlineCode> and{' '}
          <InlineCode>profile/</InlineCode>; edit there and Zeno hot-reloads.
        </p>
      </div>
      <RestartWorkerButton onClick={onRestart} />
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

function RestartWorkerButton({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-end shrink-0 inline-flex items-center gap-2 px-3.5 py-2 border border-status-failed/30 font-mono text-xs font-medium tracking-[0.06em] leading-4 uppercase text-status-failed hover:bg-status-failed/[0.06] hover:border-status-failed transition-colors duration-[120ms]"
    >
      <RestartIcon />
      restart worker
    </button>
  );
}

function RestartIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
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

function BackendSection({ backend }: { backend: SettingsSnapshot['backend'] }): JSX.Element {
  return (
    <Section title="backend" meta={`selected via ${backend.selectedVia}`}>
      <BackendCard
        name={backend.name}
        summary="Claude Agent SDK · OAuth · 300s timeout · gh + claude CLI verified at boot"
      />
    </Section>
  );
}

function ProfileFilesSection({ files }: { files: SettingsSnapshot['profileFiles'] }): JSX.Element {
  return (
    <Section title="profile files" meta="bind-mounted · edits apply on next agent turn">
      <div className="bg-panel border border-border-subtle flex flex-col">
        {files.length === 0 ? (
          <div className="px-5 py-4 font-mono text-xs text-text-tertiary">no files mounted.</div>
        ) : (
          files.map((f, i) => (
            <ProfileFileRow key={f.path} file={f} last={i === files.length - 1} />
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
      <div className="bg-panel border border-border-subtle flex flex-col">
        <AboutRow label="dashboard" value={`vite · react · tanstack-router · ${version}`} />
        <AboutRow label="backend" value={backend} />
        <AboutRow label="uptime" value={uptime !== undefined ? formatUptime(uptime) : '—'} last />
      </div>
    </Section>
  );
}
