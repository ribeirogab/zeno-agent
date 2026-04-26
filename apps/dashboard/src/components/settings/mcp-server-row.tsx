import type { JSX } from 'react';
import type { SettingsSnapshot } from '@/lib/use-settings';

type McpServer = SettingsSnapshot['mcpServers'][number];

/**
 * Row in the MCP servers table on Settings. Visual reference:
 * `apps/design/src/routes/dashboard/settings/index.tsx` — `<McpSection>` row.
 */
export function McpServerRow({
  server,
  description,
  caption,
  last,
}: {
  server: McpServer;
  /** Short description shown in the middle column (e.g. capability summary). */
  description?: string;
  /** Right-side caption (e.g. config path or process info). */
  caption?: string;
  last?: boolean;
}): JSX.Element {
  const isActive = server.status === 'enabled';
  const dotBg = isActive ? 'bg-status-active' : 'bg-status-paused';
  const statusColor = isActive ? 'text-status-active' : 'text-text-tertiary';

  return (
    <div
      className={`flex items-center gap-4 px-5 py-3 ${last ? '' : 'border-b border-border-subtle'}`}
    >
      <span className="shrink-0 w-1.5 flex justify-center">
        <span className={`w-1.5 h-1.5 rounded-full ${dotBg}`} />
      </span>
      <span className="shrink-0 w-[170px] font-mono text-xs font-medium tracking-[0.02em] leading-4 text-text-primary">
        {server.name}
      </span>
      <span className="flex-1 min-w-0 font-mono text-[11px] leading-[14px] text-text-secondary truncate">
        {description ?? server.reason ?? server.status}
      </span>
      <span className="shrink-0 w-[180px] font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary">
        {caption ?? ''}
      </span>
      <span
        className={`shrink-0 font-mono text-[10px] tracking-[0.15em] leading-3 uppercase ${statusColor}`}
      >
        {server.status}
      </span>
    </div>
  );
}
