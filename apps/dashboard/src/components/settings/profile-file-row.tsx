import type { JSX } from 'react';
import type { SettingsSnapshot } from '@/lib/use-settings';

export function ProfileFileRow({
  file,
}: {
  file: SettingsSnapshot['profileFiles'][number];
}): JSX.Element {
  return (
    <div className="flex items-center gap-4 border-b border-border-subtle px-5 py-3 last:border-b-0">
      <span className="flex-1 font-mono text-xs text-gold">{file.path}</span>
      <span className="w-[100px] shrink-0 font-mono text-[11px] text-text-secondary">
        {file.bytes.toLocaleString()} B
      </span>
      <span className="w-[220px] shrink-0 font-mono text-[10px] tracking-[0.04em] text-text-tertiary">
        {file.mtime}
      </span>
    </div>
  );
}
