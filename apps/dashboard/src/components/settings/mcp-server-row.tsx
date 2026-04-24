import { Dot } from '@zeno/ui';
import type { JSX } from 'react';
import type { SettingsSnapshot } from '@/lib/use-settings';

type McpServer = SettingsSnapshot['mcpServers'][number];

const dotTone: Record<McpServer['status'], 'active' | 'paused' | 'idle'> = {
  enabled: 'active',
  skipped: 'paused',
  disabled: 'idle',
};

export function McpServerRow({ server }: { server: McpServer }): JSX.Element {
  const tone = dotTone[server.status];
  const isActive = server.status === 'enabled';

  return (
    <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-2.5 last:border-b-0">
      <Dot tone={tone} />
      <span className="w-[170px] shrink-0 font-mono text-xs text-text-primary">{server.name}</span>
      <span className="flex-1 font-mono text-[11px] text-text-secondary">
        {server.reason ?? server.status}
      </span>
      <span
        className={`font-mono text-[10px] uppercase tracking-[0.15em] ${isActive ? 'text-status-active' : 'text-text-tertiary'}`}
      >
        {server.status}
      </span>
    </div>
  );
}
