import type { JSX } from 'react';
import type { SettingsSnapshot } from '@/lib/use-settings';

const statusColor: Record<SettingsSnapshot['mcpServers'][number]['status'], string> = {
  enabled: 'bg-status-active',
  skipped: 'bg-status-paused',
  disabled: 'bg-text-tertiary',
};

export function McpServerRow({
  server,
}: {
  server: SettingsSnapshot['mcpServers'][number];
}): JSX.Element {
  return (
    <div className="flex items-center gap-3 border-b border-panel py-2">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusColor[server.status]}`} />
      <span className="w-40 font-mono text-sm text-text-primary">{server.name}</span>
      <span className="text-sm text-text-secondary">{server.reason ?? server.status}</span>
    </div>
  );
}
