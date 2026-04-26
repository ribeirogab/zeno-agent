import type { JSX } from 'react';

/**
 * Search input for filtering log lines. Visual reference:
 * `apps/design/src/routes/dashboard/logs/index.tsx` — `<SearchInput>`.
 */
export function LogSearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (q: string) => void;
}): JSX.Element {
  return (
    <label
      htmlFor="logs-search"
      className="flex items-center gap-2 bg-panel-2 border border-border-subtle focus-within:border-gold focus-within:shadow-[0_0_0_3px_rgba(217,179,98,0.28)] transition-[border-color,box-shadow] duration-[120ms] px-3 py-2 flex-1"
    >
      <span className="font-mono text-[11px] leading-[14px] text-text-tertiary shrink-0">⌕</span>
      <input
        id="logs-search"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="event:cron_run_.* or correlationId:abc…"
        className="flex-1 bg-transparent border-0 outline-0 font-mono text-xs leading-4 text-text-primary placeholder:text-text-tertiary"
      />
    </label>
  );
}
