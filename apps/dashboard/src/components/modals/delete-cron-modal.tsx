import { AlertDialog, AlertDialogContent, AlertDialogTitle } from '@zeno/ui';
import type { JSX } from 'react';

export interface DeleteCronModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cron being deleted; null hides the modal content. */
  cron: { name: string; runsCount?: number } | null;
  onConfirm: () => void;
}

/**
 * Destructive confirmation for cron deletion. Visual reference:
 * `apps/design/src/components/modals/delete-cron-modal.tsx`. Corner brackets
 * are inlined in red here (the @zeno/ui primitive only ships gold).
 */
export function DeleteCronModal({
  open,
  onOpenChange,
  cron,
  onConfirm,
}: DeleteCronModalProps): JSX.Element | null {
  if (!cron) return null;

  const close = (): void => onOpenChange(false);
  const handleConfirm = (): void => {
    onConfirm();
    close();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[520px]">
        <RedCornerBrackets />
        <div className="px-7 pt-6 pb-6 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] font-semibold tracking-[0.2em] leading-3 uppercase text-status-failed">
              destructive · delete
            </span>
            <AlertDialogTitle className="m-0 font-serif text-[26px] tracking-[-0.015em] leading-8 text-text-primary">
              Delete cron <em className="italic text-gold">{cron.name}</em>?
            </AlertDialogTitle>
          </div>
          <div className="flex flex-col gap-1">
            <p className="m-0 font-sans text-sm leading-[1.6] text-text-secondary">
              {cron.runsCount && cron.runsCount > 0
                ? `This cron has run ${cron.runsCount} times.`
                : 'This cron has no recorded runs.'}{' '}
              Deleting removes its config, its schedule, and its full run history from the database.
            </p>
            <p className="m-0 font-sans text-sm leading-[1.6] text-status-failed font-medium">
              This cannot be undone.
            </p>
          </div>
          <div className="bg-panel-2 border border-border-subtle flex flex-col">
            <DeletionRow label="cron config" verb="delete" />
            <DeletionRow
              label={cron.runsCount ? `${cron.runsCount} run records` : 'run records'}
              verb="delete"
            />
            <DeletionRow label="profile/crons.yaml entry" verb="delete" />
            <DeletionRow label="slack thread links" verb="retained" last />
          </div>
          <div className="flex justify-end gap-2.5">
            <button
              type="button"
              onClick={close}
              className="inline-flex items-center px-3.5 py-2 border border-border-strong font-mono text-xs font-medium tracking-[0.06em] leading-4 uppercase text-text-primary hover:bg-panel-2 transition-colors duration-[120ms]"
            >
              cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="inline-flex items-center px-3.5 py-2 bg-status-failed border border-status-failed font-mono text-xs font-semibold tracking-[0.06em] leading-4 uppercase text-text-ink hover:opacity-90 transition-opacity duration-[120ms]"
            >
              delete cron
            </button>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RedCornerBrackets(): JSX.Element {
  const base = 'absolute h-3 w-3 pointer-events-none border-status-failed';
  return (
    <>
      <span className={`${base} -left-px -top-px border-l border-t`} />
      <span className={`${base} -right-px -top-px border-r border-t`} />
      <span className={`${base} -bottom-px -left-px border-b border-l`} />
      <span className={`${base} -bottom-px -right-px border-b border-r`} />
    </>
  );
}

function DeletionRow({
  label,
  verb,
  last,
}: {
  label: string;
  verb: 'delete' | 'retained';
  last?: boolean;
}): JSX.Element {
  return (
    <div
      className={`flex items-center justify-between px-3.5 py-2 ${
        last ? '' : 'border-b border-border-subtle'
      }`}
    >
      <span className="font-mono text-[11px] tracking-[0.1em] leading-[14px] uppercase text-text-secondary">
        {label}
      </span>
      <span
        className={`font-mono text-[11px] tracking-[0.04em] leading-[14px] ${
          verb === 'delete' ? 'text-status-failed' : 'text-text-tertiary'
        }`}
      >
        — {verb}
      </span>
    </div>
  );
}
