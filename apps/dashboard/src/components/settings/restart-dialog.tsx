import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  CornerBrackets,
} from '@zeno/ui';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { IcoRefresh } from '@/components/icons';
import { useRestartWorker } from '@/lib/mutations';

export function RestartDialog(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const restart = useRestartWorker();

  const reset = useCallback(() => {
    setCountdown(null);
    setOpen(false);
  }, []);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      restart.mutate();
      reset();
      return;
    }
    const timer = setTimeout(() => setCountdown((prev) => (prev !== null ? prev - 1 : null)), 700);
    return () => clearTimeout(timer);
  }, [countdown, restart, reset]);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        else setOpen(true);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="danger">
          <IcoRefresh size={12} />
          restart worker
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <CornerBrackets />
        <AlertDialogHeader>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-status-failed">
              destructive · system
            </p>
            <AlertDialogTitle className="mt-1">Restart the worker?</AlertDialogTitle>
          </div>
        </AlertDialogHeader>
        <div className="flex flex-col gap-4 px-7 py-5">
          <AlertDialogDescription>
            The Node worker will disconnect from Slack, flush its queue, reload SOUL.md + MCP
            servers, and reconnect.
          </AlertDialogDescription>
          <ul className="flex list-none flex-col gap-1.5 p-0">
            <li className="font-mono text-[10px] tracking-[0.04em] text-text-secondary">
              · in-flight cron runs will be interrupted
            </li>
            <li className="font-mono text-[10px] tracking-[0.04em] text-text-secondary">
              · Slack threads will reconnect within ~4s
            </li>
            <li className="font-mono text-[10px] tracking-[0.04em] text-text-secondary">
              · cached SDK sessions are preserved on disk
            </li>
          </ul>
          {countdown !== null && (
            <div className="border border-status-failed/30 bg-status-failed/[0.06] p-3">
              <span className="font-mono text-sm text-status-failed">
                restarting in {countdown}…
              </span>
            </div>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="ghost">cancel</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="danger"
              disabled={countdown !== null}
              onClick={(e) => {
                e.preventDefault();
                setCountdown(3);
              }}
            >
              {countdown !== null ? 'restarting…' : 'restart worker'}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
