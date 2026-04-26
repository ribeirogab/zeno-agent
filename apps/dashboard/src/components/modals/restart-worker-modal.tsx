import { AlertDialog, AlertDialogContent, AlertDialogTitle, CornerBrackets } from '@zeno/ui';
import type { JSX } from 'react';

export interface RestartWorkerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired immediately when the user clicks RESTART WORKER. No countdown — see spec 0031. */
  onConfirm: () => void;
}

/**
 * Confirmation modal for the RESTART WORKER button on Settings. Visual reference:
 * `apps/design/src/components/modals/restart-worker-modal.tsx`. The 3-step
 * countdown from the previous restart-dialog has been intentionally dropped
 * (spec 0031): clicking RESTART WORKER fires `onConfirm` and closes.
 */
export function RestartWorkerModal({
  open,
  onOpenChange,
  onConfirm,
}: RestartWorkerModalProps): JSX.Element {
  const close = (): void => onOpenChange(false);
  const handleConfirm = (): void => {
    onConfirm();
    close();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[520px]">
        <CornerBrackets />
        <div className="px-7 pt-6 pb-6 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] font-semibold tracking-[0.2em] leading-3 uppercase text-gold">
              runtime · restart
            </span>
            <AlertDialogTitle className="m-0 font-serif text-[26px] tracking-[-0.015em] leading-8 text-text-primary">
              Restart the <em className="italic text-gold">worker</em>?
            </AlertDialogTitle>
          </div>
          <p className="m-0 font-sans text-sm leading-[1.6] text-text-secondary">
            Reloads SOUL.md, MCP config, and skills from disk. In-flight Slack threads finish their
            current turn first; new messages queue for ~3s while the agent core boots.
          </p>
          <div className="bg-panel-2 border border-border-subtle flex flex-col">
            <ImpactRow label="in-flight turns" status="finished gracefully" tone="success" />
            <ImpactRow label="slack listener" status="pauses ~3s" tone="warn" />
            <ImpactRow label="cron runner" status="resumes on boot" tone="warn" />
            <ImpactRow label="api server (port 3000)" status="stays up" tone="success" last />
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
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-gold border border-gold font-mono text-xs font-semibold tracking-[0.06em] leading-4 uppercase text-text-ink hover:bg-gold-bright hover:border-gold-bright transition-colors duration-[120ms]"
            >
              ↻ restart worker
            </button>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ImpactRow({
  label,
  status,
  tone,
  last,
}: {
  label: string;
  status: string;
  tone: 'success' | 'warn';
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
          tone === 'success' ? 'text-status-active' : 'text-gold'
        }`}
      >
        — {status}
      </span>
    </div>
  );
}
