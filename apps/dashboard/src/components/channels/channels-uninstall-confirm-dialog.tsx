import { useNavigate } from '@tanstack/react-router';
import { CornerBrackets, Dialog, DialogContent, DialogTitle } from '@zeno/ui';
import type { JSX } from 'react';
import { useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { type ChannelDetail, useUninstallChannel } from '@/lib/use-channels';

/**
 * Spec 0059: uninstall confirm dialog (Paper artboard M-ch-3).
 *
 * Title and body parameterised by `channel.displayName` so the same component
 * works for Slack today + Telegram/WhatsApp later. DELETE is sync direct DB
 * delete with FK CASCADE on connector_secrets — no command queue.
 */
export interface ChannelsUninstallConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  channel: ChannelDetail;
}

export function ChannelsUninstallConfirmDialog({
  open,
  onClose,
  channel,
}: ChannelsUninstallConfirmDialogProps): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const uninstall = useUninstallChannel();
  const navigate = useNavigate();

  const handleClose = (next: boolean): void => {
    if (!next && !uninstall.isPending) {
      setError(null);
      onClose();
    }
  };

  const handleConfirm = async (): Promise<void> => {
    setError(null);
    try {
      await uninstall.mutateAsync(channel.id);
      onClose();
      // navigate back to list — the row is already gone, list will refetch
      void navigate({ to: '/channels' });
    } catch (err) {
      const msg = err instanceof ApiError ? extractApiError(err) : 'uninstall failed';
      setError(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[520px]">
        <CornerBrackets />
        <div className="flex flex-col gap-3.5 px-8 pt-7 pb-6">
          <div className="flex items-center gap-2.5">
            <svg
              aria-hidden="true"
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-status-failed"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1={12} y1={9} x2={12} y2={13} />
              <line x1={12} y1={17} x2={12.01} y2={17} />
            </svg>
            <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-status-failed">
              destructive · cannot undo
            </span>
          </div>
          <DialogTitle className="m-0 font-mono text-[22px] tracking-[-0.005em] leading-7 font-medium text-text-primary">
            uninstall {channel.displayName.toLowerCase()}?
          </DialogTitle>
          <p className="m-0 font-sans text-sm leading-snug text-text-secondary">
            Bot will stop responding to{' '}
            <span className="font-mono text-[13px] text-text-primary">{channel.displayName}</span>{' '}
            messages. The row and its{' '}
            <code className="font-mono text-xs text-gold">connector_secrets</code> are deleted in
            the same transaction (FK cascade).
          </p>
          {error ? (
            <div className="flex items-start gap-2.5 px-3.5 py-2.5 bg-status-failed/[0.06] border border-status-failed/30 rounded">
              <span className="font-mono text-xs text-status-failed">!</span>
              <span className="flex-1 font-mono text-xs text-text-primary leading-snug">
                {error}
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2.5 px-8 pt-4 pb-6 bg-sidebar border-t border-border-subtle">
          <button
            type="button"
            onClick={onClose}
            disabled={uninstall.isPending}
            className="inline-flex items-center px-4 h-9 border border-border-subtle rounded font-mono text-xs font-medium tracking-[0.06em] uppercase text-text-secondary hover:bg-panel-2 transition-colors duration-[120ms] whitespace-nowrap disabled:opacity-50"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={uninstall.isPending}
            className="inline-flex items-center gap-2 px-4 h-9 bg-status-failed/[0.14] border border-status-failed rounded font-mono text-xs font-semibold tracking-[0.06em] uppercase text-status-failed hover:bg-status-failed/[0.22] transition-colors duration-[120ms] disabled:opacity-50 whitespace-nowrap"
          >
            <svg
              aria-hidden="true"
              width={13}
              height={13}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
            {uninstall.isPending
              ? 'uninstalling…'
              : `uninstall ${channel.displayName.toLowerCase()}`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function extractApiError(err: ApiError): string {
  if (err.body && typeof err.body === 'object') {
    const body = err.body as { error?: unknown; message?: unknown };
    if (typeof body.error === 'string') return body.error;
    if (typeof body.message === 'string') return body.message;
  }
  return err.message;
}
