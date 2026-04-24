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
        'flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-all duration-[120ms]',
        isActive
          ? 'border-status-active bg-status-active/10 text-status-active'
          : 'border-border-subtle bg-transparent text-text-secondary hover:border-text-tertiary hover:text-text-primary',
      )}
    >
      <Dot tone={isActive ? 'active' : 'idle'} pulse={isActive} />
      <span>{following ? 'following' : 'paused'}</span>
    </button>
  );
}
