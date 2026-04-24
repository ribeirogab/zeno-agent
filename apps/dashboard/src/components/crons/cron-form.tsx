import { Button, Chip, Input } from '@zeno/ui';
import { type FormEvent, type JSX, useId, useState } from 'react';
import type { CreateCronInput } from '@/lib/mutations';

const PRESETS: ReadonlyArray<readonly [string, string]> = [
  ['every day · 09:00', '0 9 * * *'],
  ['every day · 21:00', '0 21 * * *'],
  ['weekdays · 09:00', '0 9 * * 1-5'],
  ['every 30 minutes', '*/30 * * * *'],
  ['every 2 hours', '0 */2 * * *'],
  ['friday · 18:00', '0 18 * * 5'],
] as const;

export function CronForm({
  onSubmit,
  submitting,
  onCancel,
}: {
  onSubmit: (input: CreateCronInput) => void;
  submitting: boolean;
  onCancel: () => void;
}): JSX.Element {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [schedule, setSchedule] = useState('');
  const [prompt, setPrompt] = useState('');
  const [notifyConversationId, setNotifyConversationId] = useState('');

  const nameId = useId();
  const descriptionId = useId();
  const scheduleId = useId();
  const promptId = useId();
  const notifyId = useId();

  const handle = (event: FormEvent): void => {
    event.preventDefault();
    const input: CreateCronInput = {
      name,
      schedule,
      prompt,
      notifyConversationId: notifyConversationId || null,
    };
    if (description) input.description = description;
    onSubmit(input);
  };

  return (
    <form onSubmit={handle} className="flex flex-col">
      <div className="flex flex-col gap-4.5 px-7 py-5.5">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={nameId}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold"
          >
            name
          </label>
          <Input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            pattern="[a-z0-9][a-z0-9-]*"
          />
          <span className="font-mono text-[10px] text-text-tertiary">
            kebab-case · becomes the cronId everywhere
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={descriptionId}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold"
          >
            description
          </label>
          <Input
            id={descriptionId}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={scheduleId}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold"
          >
            schedule · cron expression
          </label>
          <Input
            id={scheduleId}
            value={schedule}
            onChange={(event) => setSchedule(event.target.value)}
            className="text-gold"
          />
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(([label, value]) => (
              <Chip
                key={value}
                active={schedule === value}
                onClick={() => setSchedule(value)}
              >
                {label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={promptId}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold"
          >
            prompt · what zeno should do
          </label>
          <textarea
            id={promptId}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            required
            rows={5}
            className="w-full border border-border-subtle bg-panel-2 px-3 py-2.5 font-mono text-[13px] text-text-primary transition-all duration-[120ms] placeholder:text-text-tertiary focus:border-gold focus:outline-none focus:ring-3 focus:ring-gold-ring"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={notifyId}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold"
          >
            notify · slack channel or dm
          </label>
          <Input
            id={notifyId}
            value={notifyConversationId}
            onChange={(event) => setNotifyConversationId(event.target.value)}
            placeholder="#zeno"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2.5 border-t border-border-subtle bg-sidebar px-7 py-4">
        <Button variant="ghost" type="button" onClick={onCancel}>
          cancel
        </Button>
        <Button variant="primary" type="submit" disabled={submitting}>
          {submitting ? 'creating...' : 'commission cron ↵'}
        </Button>
      </div>
    </form>
  );
}
