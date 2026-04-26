import { Dialog, DialogContent, useToast } from '@zeno/ui';
import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import type { CreateCronInput } from '@/lib/mutations';

export interface NewCronModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the form payload. Should perform the create + close on success. */
  onCreate: (input: CreateCronInput) => Promise<unknown> | unknown;
}

const DEFAULT_PROMPT =
  'List all open PRs in acme/* and northwind/*.\nFor each: title, author, age, CI status.\nFormat: concise bullets, in English.';

/**
 * Modal to create a new cron. Visual reference:
 * `apps/design/src/components/modals/new-cron-modal.tsx`.
 *
 * Test-run is a visual placeholder — the backend has no pre-create test
 * endpoint yet, so the button surfaces a mock "test passed" toast. Wire to
 * a real endpoint when the API supports it.
 */
export function NewCronModal({ open, onOpenChange, onCreate }: NewCronModalProps): JSX.Element {
  const toast = useToast();
  const [name, setName] = useState('morning-pr-summary');
  const [schedule, setSchedule] = useState('0 9 * * 1-5');
  const [source, setSource] = useState<'chat' | 'static'>('chat');
  const [channel, setChannel] = useState('zeno');
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);

  const close = (): void => onOpenChange(false);

  const handleCreate = async (): Promise<void> => {
    await onCreate({
      name,
      prompt,
      schedule,
      notifyConversationId: null,
      notifyThreadId: null,
    });
    close();
  };

  const handleTestRun = (): void => {
    toast.warn(
      <>
        <span className="text-gold">{name}</span> · test running…
      </>,
      { durationMs: 1800 },
    );
    setTimeout(() => {
      toast.success(
        <>
          <span className="text-status-active">{name}</span> · test passed · 1.5s
        </>,
      );
    }, 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent width="w-[700px] max-w-[calc(100vw-48px)]">
        <div className="flex flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-border-subtle pt-[22px] px-7 pb-3.5">
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-gold">
                create · cron
              </span>
              <h2 className="m-0 font-serif text-[22px] tracking-[-0.015em] leading-7 text-text-primary">
                New <em className="italic text-gold">cron</em>
              </h2>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="shrink-0 w-7 h-7 inline-flex items-center justify-center border border-border-subtle font-mono text-sm leading-4 text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors duration-[120ms]"
            >
              ×
            </button>
          </div>
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
                <Field
                  label="schedule"
                  helper={
                    <span className="text-status-active">
                      ✓ every weekday at 09:00 · next: tomorrow 09:00
                    </span>
                  }
                >
                  <input
                    value={schedule}
                    onChange={(e) => setSchedule(e.target.value)}
                    className="w-full bg-panel-2 border border-gold px-3 py-2.5 font-mono text-[13px] leading-4 text-text-primary outline-0"
                    style={{ boxShadow: '0 0 0 3px rgba(217, 179, 98, 0.28)' }}
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
                <span className="font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary">
                  or DM alex
                </span>
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
              tip · save without test creates a paused cron
            </span>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={close}
                className="inline-flex items-center px-3.5 py-2 border border-border-strong font-mono text-xs font-medium tracking-[0.06em] leading-4 uppercase text-text-primary hover:bg-panel-2 transition-colors duration-[120ms]"
              >
                cancel
              </button>
              <button
                type="button"
                onClick={handleTestRun}
                className="inline-flex items-center px-3.5 py-2 border border-gold-line font-mono text-xs font-medium tracking-[0.06em] leading-4 uppercase text-gold hover:bg-gold-soft hover:border-gold transition-colors duration-[120ms]"
              >
                test run
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleCreate();
                }}
                className="inline-flex items-center px-3.5 py-2 bg-gold border border-gold font-mono text-xs font-semibold tracking-[0.06em] leading-4 uppercase text-text-ink hover:bg-gold-bright hover:border-gold-bright transition-colors duration-[120ms]"
              >
                create cron
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
