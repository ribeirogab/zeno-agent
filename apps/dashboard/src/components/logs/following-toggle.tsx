import { cn, Dot } from '@zeno/ui';
import type { JSX } from 'react';

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
      className={cn(
        'inline-flex items-center gap-2 border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] transition-all duration-[120ms]',
        isActive
          ? 'border-[rgba(107,211,163,0.35)] bg-[rgba(107,211,163,0.06)] text-status-active'
          : 'border-border-subtle bg-transparent text-text-tertiary',
      )}
    >
      <Dot tone={isActive ? 'active' : 'idle'} pulse={isActive} />
      <span>{following ? 'following' : 'paused'}</span>
    </button>
  );
}
