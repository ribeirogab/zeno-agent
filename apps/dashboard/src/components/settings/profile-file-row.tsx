import type { JSX } from 'react';
import type { SettingsSnapshot } from '@/lib/use-settings';

/**
 * Row in the profile-files table on Settings. Visual reference:
 * `apps/design/src/routes/dashboard/settings/index.tsx` — `<ProfileFilesSection>` row.
 */
export function ProfileFileRow({
  file,
  last,
}: {
  file: SettingsSnapshot['profileFiles'][number];
  last?: boolean;
}): JSX.Element {
  return (
    <div
      className={`flex items-center gap-4 px-5 py-3 ${last ? '' : 'border-b border-border-subtle'}`}
    >
      <span className="flex-1 min-w-0 font-mono text-xs leading-4 text-gold truncate">
        {file.path}
      </span>
      <span className="shrink-0 w-[100px] font-mono text-[11px] leading-[14px] text-text-secondary">
        {file.bytes.toLocaleString()} B
      </span>
      <span className="shrink-0 w-[220px] font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary">
        {formatRelative(file.mtime)}
      </span>
    </div>
  );
}

function formatRelative(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return 'just now';
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
  } catch {
    return iso;
  }
}
