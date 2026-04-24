import type { JSX } from 'react';

export function LogSearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (q: string) => void;
}): JSX.Element {
  return (
    <div className="flex flex-1 items-center gap-2 border border-border-subtle bg-panel-2 px-3 py-2 focus-within:border-gold focus-within:shadow-[0_0_0_3px_var(--color-gold-ring)]">
      <span className="font-mono text-[11px] text-text-tertiary">⌕</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="event:cron_run_.* or correlationId:abc…"
        className="w-full bg-transparent font-mono text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none"
      />
    </div>
  );
}
