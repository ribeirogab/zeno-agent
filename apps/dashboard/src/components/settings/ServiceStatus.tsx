import type { JSX } from 'react';

export function ServiceStatus({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: 'ok' | 'warn' | 'unknown';
}): JSX.Element {
  const color =
    status === 'ok'
      ? 'bg-status-active'
      : status === 'warn'
        ? 'bg-status-paused'
        : 'bg-text-tertiary';
  return (
    <div className="flex items-center gap-3">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="font-mono text-sm text-text-primary">{value}</span>
    </div>
  );
}
