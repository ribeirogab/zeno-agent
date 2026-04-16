import type { JSX } from 'react';
import type { SettingsSnapshot } from '@/lib/use-settings';

export function ProfileFileRow({
  file,
}: {
  file: SettingsSnapshot['profileFiles'][number];
}): JSX.Element {
  return (
    <div className="flex items-center gap-3 border-b border-panel py-2">
      <span className="w-40 font-mono text-sm text-text-primary">{file.path}</span>
      <span className="w-24 text-sm text-text-secondary">{file.bytes.toLocaleString()} bytes</span>
      <span className="text-xs text-text-tertiary">{file.mtime}</span>
    </div>
  );
}
