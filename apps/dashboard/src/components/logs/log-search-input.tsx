import type { JSX } from 'react';
import { Input } from '@/components/ui/input';

export function LogSearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (q: string) => void;
}): JSX.Element {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="event: cron_run  ou  correlationId: abc-123"
      className="font-mono text-xs"
    />
  );
}
