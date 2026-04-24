import type { DotTone } from '@zeno/ui';
import { Pill } from '@zeno/ui';
import type { JSX } from 'react';
import type { CronApi } from '@/lib/use-crons';

function cronTone(cron: CronApi): DotTone {
  if (!cron.enabled) return 'paused';
  return 'active';
}

export function CronStatusPill({ cron }: { cron: CronApi }): JSX.Element {
  const tone = cronTone(cron);
  return <Pill tone={tone}>{tone}</Pill>;
}
