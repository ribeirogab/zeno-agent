import { createFileRoute } from '@tanstack/react-router';
import type { JSX } from 'react';
import { McpServerRow } from '@/components/settings/McpServerRow';
import { ProfileFileRow } from '@/components/settings/ProfileFileRow';
import { RestartDialog } from '@/components/settings/RestartDialog';
import { ServiceStatus } from '@/components/settings/ServiceStatus';
import { useSettings } from '@/lib/use-settings';

export const Route = createFileRoute('/_authed/settings')({
  component: SettingsPage,
});

function SettingsPage(): JSX.Element {
  const q = useSettings();
  if (q.isLoading || !q.data) {
    return <span className="text-sm text-text-secondary">carregando…</span>;
  }
  const s = q.data;
  return (
    <div className="flex flex-col gap-10">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            System
          </span>
          <h1 className="text-[22px] font-semibold tracking-tight text-text-primary">Settings</h1>
          <p className="max-w-[560px] text-sm leading-5 text-text-secondary">
            Read-only snapshot. Edit <span className="font-mono">.env</span> and
            <span className="font-mono"> profile/</span> files on disk — the watcher reloads most
            changes; MCP changes require a worker restart.
          </p>
        </div>
        <RestartDialog />
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-text-primary">Backend</h2>
        <ServiceStatus label="name" value={s.backend.name} status="ok" />
        <ServiceStatus label="selected via" value={s.backend.selectedVia} status="ok" />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-text-primary">MCP servers</h2>
        {s.mcpServers.length === 0 && (
          <span className="text-sm text-text-secondary">nenhum server configurado</span>
        )}
        {s.mcpServers.map((m) => (
          <McpServerRow key={m.name} server={m} />
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-text-primary">Profile files</h2>
        {s.profileFiles.map((f) => (
          <ProfileFileRow key={f.path} file={f} />
        ))}
      </section>
    </div>
  );
}
