import { createFileRoute } from '@tanstack/react-router';
import { EmptyState, Kicker } from '@zeno/ui';
import type { JSX } from 'react';
import { AboutRow } from '@/components/settings/about-row';
import { BackendCard } from '@/components/settings/backend-card';
import { McpServerRow } from '@/components/settings/mcp-server-row';
import { ProfileFileRow } from '@/components/settings/profile-file-row';
import { RestartDialog } from '@/components/settings/restart-dialog';
import { SettingsSkeleton } from '@/components/skeletons/settings-skeleton';
import { useHealth } from '@/lib/use-health';
import { useSettings } from '@/lib/use-settings';

export const Route = createFileRoute('/_authed/settings')({
  component: SettingsPage,
});

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  return `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
}

function SettingsPage(): JSX.Element {
  const q = useSettings();
  const health = useHealth();

  if (q.isLoading || !q.data) {
    return <SettingsSkeleton />;
  }

  const s = q.data;
  const uptime = health.data?.uptime;

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-10 px-12 pt-10 pb-30">
      <header className="flex items-end justify-between gap-6 border-b border-border-subtle pb-6">
        <div>
          <Kicker>system</Kicker>
          <h1 className="mt-2 font-sans text-[32px] font-medium tracking-[-0.015em] text-text-primary">
            settings
          </h1>
          <p className="mt-2.5 max-w-[640px] text-sm leading-relaxed text-text-secondary">
            Read-only view. Most knobs live in{' '}
            <span className="border border-border-subtle bg-panel-2 px-1.5 py-px font-mono text-xs text-gold">
              .env
            </span>{' '}
            and{' '}
            <span className="border border-border-subtle bg-panel-2 px-1.5 py-px font-mono text-xs text-gold">
              profile/
            </span>
            ; edit there and Zeno hot-reloads.
          </p>
        </div>
        <RestartDialog />
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
          <h2 className="font-sans text-lg font-medium tracking-[-0.005em] text-text-primary">
            backend
          </h2>
          <Kicker mute>selected at boot · ZENO_BACKEND={s.backend.name}</Kicker>
        </div>
        <BackendCard name={s.backend.name} selectedVia={s.backend.selectedVia} />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
          <h2 className="font-sans text-lg font-medium tracking-[-0.005em] text-text-primary">
            mcp servers
          </h2>
          <Kicker mute>loaded from profile/mcp.json</Kicker>
        </div>
        <div className="flex flex-col border border-border-subtle bg-panel">
          {s.mcpServers.length === 0 ? (
            <EmptyState title="no servers configured" />
          ) : (
            s.mcpServers.map((m) => <McpServerRow key={m.name} server={m} />)
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
          <h2 className="font-sans text-lg font-medium tracking-[-0.005em] text-text-primary">
            profile files
          </h2>
          <Kicker mute>bind-mounted · edits apply on next agent turn</Kicker>
        </div>
        <div className="flex flex-col border border-border-subtle bg-panel">
          {s.profileFiles.map((f) => (
            <ProfileFileRow key={f.path} file={f} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
          <h2 className="font-sans text-lg font-medium tracking-[-0.005em] text-text-primary">
            about
          </h2>
          <Kicker mute>runtime</Kicker>
        </div>
        <div className="flex flex-col border border-border-subtle bg-panel">
          <AboutRow label="backend" value={s.backend.name} />
          {uptime !== undefined && <AboutRow label="uptime" value={formatUptime(uptime)} />}
          <AboutRow label="dashboard" value="vite · react · tanstack-router" />
        </div>
      </section>
    </div>
  );
}
