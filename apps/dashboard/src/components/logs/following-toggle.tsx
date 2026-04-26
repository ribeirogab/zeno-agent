import type { JSX } from 'react';

/**
 * Follow / pause toggle for the SSE stream. Visual reference:
 * `apps/design/src/routes/dashboard/logs/index.tsx` — `<FollowingPill>`.
 */
export function FollowingToggle({
  following,
  connected,
  onChange,
}: {
  following: boolean;
  connected: boolean;
  onChange: (v: boolean) => void;
}): JSX.Element {
  const isActive = following && connected;
  return (
    <button
      type="button"
      onClick={() => onChange(!following)}
      className={`self-end shrink-0 inline-flex items-center gap-2 px-3 py-1.5 border font-mono text-[10px] tracking-[0.15em] leading-3 uppercase transition-colors duration-[120ms] ${
        isActive
          ? 'bg-status-active/[0.06] border-status-active/35 text-status-active'
          : 'border-border-subtle bg-transparent text-text-tertiary hover:border-border-strong'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          isActive ? 'bg-status-active' : 'bg-text-tertiary'
        }`}
      />
      <span>{following ? 'following' : 'paused'}</span>
    </button>
  );
}
