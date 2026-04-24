import { Skeleton } from '@zeno/ui';
import type { JSX } from 'react';

const PANEL_KEYS = ['backend', 'mcp', 'profile', 'shutdown'];

export function SettingsSkeleton(): JSX.Element {
  return (
    <div className="zen-page">
      {PANEL_KEYS.map((key) => (
        <section key={key} className="flex flex-col gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-24 w-full" />
        </section>
      ))}
    </div>
  );
}
