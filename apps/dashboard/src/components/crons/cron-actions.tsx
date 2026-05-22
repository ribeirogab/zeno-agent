/**
 * Spec 2026-05-22 (crons CLI-first) — read-only action cluster.
 * Each chip opens a <CommandModal> with the exact `zeno cron …` command.
 */

import { type JSX, useState } from 'react';
import { CommandModal } from '@/components/command-modal';
import type { CommandKind } from '@/lib/build-cli-command';
import type { CronApi } from '@/lib/use-crons';

export function CronActions({ cron }: { cron: CronApi }): JSX.Element {
  const [open, setOpen] = useState<CommandKind | null>(null);

  return (
    <>
      <div className="flex shrink-0 self-end gap-2">
        <button
          type="button"
          onClick={() => setOpen({ kind: 'cron-open', slug: cron.id })}
          className="inline-flex items-center gap-2 px-3.5 py-2 border border-transparent font-mono text-xs font-medium tracking-[0.06em] leading-4 uppercase text-text-secondary hover:text-text-primary transition-colors duration-[120ms]"
        >
          open
        </button>
        <button
          type="button"
          onClick={() =>
            setOpen({ kind: cron.enabled ? 'cron-disable' : 'cron-enable', slug: cron.id })
          }
          className="inline-flex items-center gap-2 px-3.5 py-2 border border-transparent font-mono text-xs font-medium tracking-[0.06em] leading-4 uppercase text-text-secondary hover:text-text-primary transition-colors duration-[120ms]"
        >
          {cron.enabled ? 'disable' : 'enable'}
        </button>
        <button
          type="button"
          onClick={() => setOpen({ kind: 'cron-test', slug: cron.id })}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-gold border border-gold font-mono text-xs font-semibold tracking-[0.06em] leading-4 uppercase text-text-ink hover:bg-gold-bright hover:border-gold-bright transition-colors duration-[120ms]"
        >
          <PlayIcon />
          test
        </button>
        <button
          type="button"
          onClick={() => setOpen({ kind: 'cron-delete', slug: cron.id })}
          className="inline-flex items-center px-3.5 py-2 border border-status-failed/40 font-mono text-xs font-semibold tracking-[0.06em] leading-4 uppercase text-status-failed hover:bg-status-failed/[0.08] transition-colors duration-[120ms]"
        >
          delete
        </button>
      </div>
      {open ? <CommandModal spec={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function PlayIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <polygon points="6 4 20 12 6 20 6 4" />
    </svg>
  );
}
