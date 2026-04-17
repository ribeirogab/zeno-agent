import { cn } from '@zeno/ui';
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
  const dot = following && connected ? 'bg-status-active' : 'bg-text-tertiary';
  return (
    <button
      type="button"
      onClick={() => onChange(!following)}
      className={cn(
        'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors',
        following
          ? 'border-border-subtle bg-panel text-text-primary'
          : 'border-border-subtle bg-transparent text-text-secondary',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      <span>{following ? 'Following' : 'Follow'}</span>
    </button>
  );
}
