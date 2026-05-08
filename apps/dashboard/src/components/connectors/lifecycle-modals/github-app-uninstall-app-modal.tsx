/**
 * M12 — Uninstall App modal. Spec 0046.
 *
 * Destructive App-level action. Type the App name (italic gold display) to
 * confirm. On submit: POST /catalog/github-app/uninstall-app → backend
 * deletes connector_apps row → ON DELETE CASCADE removes every
 * github-app-* connector + secrets in one transaction → worker tear-down
 * runs async via `app_uninstall` command.
 *
 * Visual matches M10 destructive pattern. Italic gold App name in the
 * type-to-confirm input, matching the modal title's italic gold rendering.
 */

import { useNavigate } from '@tanstack/react-router';
import { CornerBrackets, Dialog, DialogContent, DialogTitle } from '@zeno/ui';
import type { JSX } from 'react';
import { useState } from 'react';
import { TypeToConfirm } from '@/components/shared/type-to-confirm';
import { ApiError } from '@/lib/api-client';
import { useUninstallApp } from '@/lib/use-uninstall-app';

interface Props {
  appUuid: string;
  appName: string;
  installationCount: number;
  onClose: () => void;
}

export function GitHubAppUninstallAppModal({
  appUuid,
  appName,
  installationCount,
  onClose,
}: Props): JSX.Element {
  const uninstall = useUninstallApp(appUuid);
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const matches = confirm === appName;
  const canSubmit = matches && !uninstall.isPending;

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    try {
      // Spec 2026-05-08-connectors-cli-first-design Task 10: endpoint now
      // returns 202 + { correlationId }. apiFetch already throws on non-2xx,
      // so reaching this line means the command was enqueued successfully.
      await uninstall.mutateAsync({ confirmAppName: appName });
      onClose();
      navigate({ to: '/connectors' });
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { error?: string } | null;
        setError(body?.error ?? `api ${err.status}`);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[640px]">
        <CornerBrackets />
        <Header appName={appName} />
        <div className="flex flex-col gap-[18px] px-7 py-[22px]">
          <ConsequencesCallout installationCount={installationCount} />
          <TypeToConfirm
            label={`type the App name "${appName}" to confirm`}
            expected={appName}
            value={confirm}
            onChange={setConfirm}
            italicGold
          />
          {error && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-status-failed/[0.06] border border-status-failed/30 border-l-2 border-l-status-failed">
              <span className="font-mono text-xs leading-4 text-status-failed">✗</span>
              <span className="flex-1 font-mono text-xs leading-4 text-text-primary">{error}</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2.5 bg-sidebar border-t border-border-subtle px-7 pt-4 pb-[22px]">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center px-3.5 py-2 border border-border-strong font-mono text-xs font-medium tracking-[0.06em] leading-4 uppercase text-text-primary hover:bg-panel-2 transition-colors duration-[120ms]"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="inline-flex items-center px-3.5 py-2 bg-status-failed border border-status-failed font-mono text-xs font-semibold tracking-[0.06em] leading-4 uppercase text-canvas hover:bg-status-failed/90 hover:border-status-failed/90 transition-colors duration-[120ms] disabled:opacity-50"
          >
            {uninstall.isPending ? 'uninstalling…' : 'uninstall app'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Header({ appName }: { appName: string }): JSX.Element {
  return (
    <div className="flex items-start gap-3 border-b border-status-failed/30 pt-[22px] px-7 pb-3.5">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-status-failed">
          uninstall · destructive
        </span>
        <DialogTitle className="m-0 font-serif text-[22px] tracking-[-0.015em] leading-7 text-text-primary">
          Uninstall <em className="italic text-gold">{appName}</em>
        </DialogTitle>
      </div>
    </div>
  );
}

function ConsequencesCallout({ installationCount }: { installationCount: number }): JSX.Element {
  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-status-failed/[0.04] border border-status-failed/30 border-l-2 border-l-status-failed">
      <span className="font-mono text-xs leading-4 text-status-failed mt-0.5">!</span>
      <div className="flex-1 flex flex-col gap-1.5">
        <span className="font-mono text-[11px] tracking-[0.06em] leading-[14px] uppercase text-status-failed">
          this will:
        </span>
        <ul className="m-0 list-disc list-inside font-sans text-[13px] leading-5 text-text-primary">
          <li>
            delete {installationCount} installation connector
            {installationCount === 1 ? '' : 's'} (cascade)
          </li>
          <li>revoke all cached installation tokens</li>
          <li>permanently delete the PEM from the database</li>
        </ul>
        <span className="font-sans text-[12px] leading-[18px] text-text-tertiary mt-1">
          The App on GitHub stays installed in your orgs — re-import anytime via M7 auto-discover.
        </span>
      </div>
    </div>
  );
}
