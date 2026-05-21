import type { JSX } from 'react';

export function KnowledgeEmptyState(): JSX.Element {
  return (
    <div className="flex flex-col items-start gap-3 p-6 text-text-secondary">
      <p className="font-sans text-sm">Select a file from the left to view it here.</p>
      <p className="font-mono text-[12px] text-text-tertiary">
        Knowledge lives under <code>~/.zeno/profiles/&lt;name&gt;/knowledge/</code>. Edit notes in
        your editor; the dashboard surfaces them read-only.
      </p>
    </div>
  );
}
