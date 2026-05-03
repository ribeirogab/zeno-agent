import type { FormEvent, JSX, ReactNode } from 'react';
import { useState } from 'react';
import { SchedulePicker } from '@/components/crons/schedule-picker';
import type { CreateCronInput } from '@/lib/mutations';
import { useSettings } from '@/lib/use-settings';

export interface CronFormState {
  name: string;
  description: string;
  schedule: string;
  prompt: string;
  notifyChannel: string;
  source: 'chat' | 'static';
}

export interface CronFormProps {
  initial?: Partial<CronFormState>;
  /** Called with the assembled `CreateCronInput` on submit. */
  onSubmit: (input: CreateCronInput) => Promise<unknown> | unknown;
  /** Cancel button handler. */
  onCancel: () => void;
  /** Disables the submit button while a mutation is in flight. */
  submitting?: boolean;
  /** Footer hint shown bottom-left, e.g. "tip · save without test creates a paused cron". */
  footerHint?: ReactNode;
  /** Extra footer slot (e.g. a "test run" button) rendered before the submit button. */
  footerExtras?: ReactNode;
  /** Customizes the submit button label. */
  submitLabel?: string;
}

/**
 * Reusable form fields for the cron create/edit modals. Visual styling is
 * extracted from `apps/design/src/components/modals/new-cron-modal.tsx`. The
 * top-level <form> wraps everything so consumers can drop this inside a Dialog
 * body without re-implementing field styles.
 */
export function CronForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
  footerHint,
  footerExtras,
  submitLabel = 'create cron',
}: CronFormProps): JSX.Element {
  const [name, setName] = useState(initial?.name ?? 'morning-pr-summary');
  const [schedule, setSchedule] = useState(initial?.schedule ?? '0 9 * * 1-5');
  const [source, setSource] = useState<'chat' | 'static'>(initial?.source ?? 'chat');
  const [channel, setChannel] = useState(initial?.notifyChannel ?? 'zeno');
  const [prompt, setPrompt] = useState(
    initial?.prompt ??
      'List all open PRs in acme/* and northwind/*.\nFor each: title, author, age, CI status.\nFormat: concise bullets, in English.',
  );

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const input: CreateCronInput = {
      name,
      prompt,
      schedule,
      notifyConversationId: null,
      notifyThreadId: null,
    };
    if (initial?.description) input.description = initial.description;
    await onSubmit(input);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col">
      <div className="flex flex-col gap-[18px] px-7 py-[22px]">
        <Field label="name" helper="slug · used in logs and CLI">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-panel-2 border border-border-subtle px-3 py-2.5 font-mono text-[13px] leading-4 text-text-primary outline-0 focus:border-gold focus:shadow-[0_0_0_3px_rgba(217,179,98,0.28)]"
          />
        </Field>
        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="schedule">
              <SchedulePicker
                value={schedule}
                onChange={setSchedule}
                helper="every weekday at 09:00 · next: tomorrow 09:00"
              />
            </Field>
          </div>
          <div className="w-[200px]">
            <Field label="source">
              <div className="flex border border-border-subtle">
                <SourceOption active={source === 'chat'} onClick={() => setSource('chat')}>
                  chat
                </SourceOption>
                <SourceOption active={source === 'static'} onClick={() => setSource('static')}>
                  static
                </SourceOption>
              </div>
            </Field>
          </div>
        </div>
        <Field label="notify on">
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-panel-2 border border-border-subtle px-3 py-2.5 flex items-center gap-1.5">
              <span className="font-mono text-xs text-gold">#</span>
              <input
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="flex-1 bg-transparent border-0 outline-0 font-mono text-[13px] leading-4 text-text-primary"
              />
            </div>
            <DmHint />
          </div>
        </Field>
        <Field label="prompt" helper="prompt sent to the agent on every tick">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            className="w-full bg-panel-2 border border-border-subtle px-3.5 py-3 font-mono text-[13px] leading-[22px] text-text-primary outline-0 focus:border-gold focus:shadow-[0_0_0_3px_rgba(217,179,98,0.28)] resize-none"
          />
        </Field>
      </div>
      <div className="flex items-center justify-between gap-2.5 bg-sidebar border-t border-border-subtle px-7 pt-4 pb-[22px]">
        <span className="font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary">
          {footerHint}
        </span>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center px-3.5 py-2 border border-border-strong font-mono text-xs font-medium tracking-[0.06em] leading-4 uppercase text-text-primary hover:bg-panel-2 transition-colors duration-[120ms]"
          >
            cancel
          </button>
          {footerExtras}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center px-3.5 py-2 bg-gold border border-gold font-mono text-xs font-semibold tracking-[0.06em] leading-4 uppercase text-text-ink hover:bg-gold-bright hover:border-gold-bright transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'saving…' : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

// Spec 0066 A follow-up: DM hint targets the operator described in
// USER.md frontmatter, not the legacy hardcoded 'alex'. Falls back to
// the profile slug when frontmatter has no name.
function DmHint(): JSX.Element {
  const settings = useSettings();
  const profile = settings.data?.profile;
  const target = profile?.name ?? profile?.slug ?? 'you';
  return (
    <span className="font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary">
      or DM {target}
    </span>
  );
}

function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] tracking-[0.18em] leading-3 uppercase text-gold">
        {label}
      </span>
      {children}
      {helper ? (
        <span className="font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary">
          {helper}
        </span>
      ) : null}
    </div>
  );
}

function SourceOption({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2.5 text-center font-mono text-[11px] tracking-[0.1em] leading-3 uppercase transition-colors duration-[120ms] ${
        active
          ? 'bg-gold-soft text-gold'
          : 'border-l border-border-subtle first:border-l-0 text-text-secondary hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}
