import type { JSX } from 'react';
import type { SettingsSnapshot } from '@/lib/use-settings';

export function ProfileFileRow({
  file,
}: {
  file: SettingsSnapshot['profileFiles'][number];
}): JSX.Element {
  return (
    <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-2.5 last:border-b-0">
      <span className="flex-1 font-mono text-sm text-gold">{file.path}</span>
      <span className="w-[100px] shrink-0 font-mono text-[11px] text-text-secondary">
        {file.bytes.toLocaleString()} B
      </span>
      <span className="w-[220px] shrink-0 font-mono text-xs text-text-tertiary">{file.mtime}</span>
    </div>
  );
}
