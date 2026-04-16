import { type FormEvent, type JSX, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CreateCronInput } from '@/lib/mutations';

export function CronForm({
  onSubmit,
  submitting,
}: {
  onSubmit: (input: CreateCronInput) => void;
  submitting: boolean;
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
    <form onSubmit={handle} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={nameId}
          className="text-xs font-medium uppercase tracking-wider text-text-secondary"
        >
          Name *
        </label>
        <Input
          id={nameId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          pattern="[a-z0-9][a-z0-9-]*"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={descriptionId}
          className="text-xs font-medium uppercase tracking-wider text-text-secondary"
        >
          Description
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
          className="text-xs font-medium uppercase tracking-wider text-text-secondary"
        >
          Schedule *
        </label>
        <Input
          id={scheduleId}
          value={schedule}
          onChange={(event) => setSchedule(event.target.value)}
          placeholder="0 9 * * 1-5"
          required
          className="font-mono"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={promptId}
          className="text-xs font-medium uppercase tracking-wider text-text-secondary"
        >
          Prompt *
        </label>
        <textarea
          id={promptId}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          required
          rows={5}
          className="rounded-md border border-border-subtle bg-canvas px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={notifyId}
          className="text-xs font-medium uppercase tracking-wider text-text-secondary"
        >
          Slack channel id (optional)
        </label>
        <Input
          id={notifyId}
          value={notifyConversationId}
          onChange={(event) => setNotifyConversationId(event.target.value)}
          placeholder="C12345ABC"
          className="font-mono"
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'criando…' : 'Criar cron'}
      </Button>
    </form>
  );
}
