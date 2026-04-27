/**
 * M10 — Remove Installation modal. Spec 0046.
 *
 * Destructive. Type the installation displayName to confirm. On submit:
 * DELETE /api/connectors/:id → worker `connector_uninstall` handler →
 * `githubApp.removeInstallation()` → connector row + secrets + tools deleted
 * via FK cascade.
 *
 * App credentials and other installations are NOT touched.
 */

import { CornerBrackets, Dialog, DialogContent, DialogTitle } from '@zeno/ui';
import type { JSX } from 'react';
import { useState } from 'react';
import { TypeToConfirm } from '@/components/shared/type-to-confirm';
import { ApiError } from '@/lib/api-client';
import { useRemoveInstallation } from '@/lib/use-remove-installation';

interface Props {
  appUuid: string;
  installation: {
    connectorId: string;
    displayName: string;
    envVar: string | null;
    toolCount: number;
  };
  onClose: () => void;
}

export function GitHubAppRemoveInstallationModal({
  appUuid,
  installation,
  onClose,
}: Props): JSX.Element {
  const remove = useRemoveInstallation(appUuid);
  // Strip the "GitHub App — " prefix (added at install time) for the
  // type-to-confirm value; the operator types the human-readable name.
  const expectedName = installation.displayName.replace(/^GitHub App — /, '');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const matches = confirm === expectedName;

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    try {
      await remove.mutateAsync(installation.connectorId);
      onClose();
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
      <DialogContent className="w-[560px]">
        <CornerBrackets />
        <div className="flex items-start gap-3 border-b border-border-subtle pt-[22px] px-7 pb-3.5">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-status-failed">
              remove · destructive
            </span>
            <DialogTitle className="m-0 font-serif text-[22px] tracking-[-0.015em] leading-7 text-text-primary">
              Remove <em className="italic text-gold">{expectedName}</em>
            </DialogTitle>
          </div>
        </div>
        <div className="flex flex-col gap-[18px] px-7 py-[22px]">
          <ConsequencesCallout installation={installation} />
          <TypeToConfirm
            label={`type the installation name "${expectedName}" to confirm`}
            expected={expectedName}
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
            disabled={!matches || remove.isPending}
            className="inline-flex items-center px-3.5 py-2 bg-status-failed border border-status-failed font-mono text-xs font-semibold tracking-[0.06em] leading-4 uppercase text-canvas hover:bg-status-failed/90 hover:border-status-failed/90 transition-colors duration-[120ms] disabled:opacity-50"
          >
            {remove.isPending ? 'removing…' : 'remove installation'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConsequencesCallout({
  installation,
}: {
  installation: { envVar: string | null; toolCount: number };
}): JSX.Element {
  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-status-failed/[0.04] border border-status-failed/30 border-l-2 border-l-status-failed">
      <span className="font-mono text-xs leading-4 text-status-failed mt-0.5">!</span>
      <div className="flex-1 flex flex-col gap-1.5">
        <span className="font-mono text-[11px] tracking-[0.06em] leading-[14px] uppercase text-status-failed">
          this will:
        </span>
        <ul className="m-0 list-disc list-inside font-sans text-[13px] leading-5 text-text-primary">
          <li>delete the installation connector + its {installation.toolCount} tool permissions</li>
          {installation.envVar && (
            <li>
              unset env var <span className="font-mono text-gold">{installation.envVar}</span>
            </li>
          )}
          <li>revoke the cached installation token</li>
        </ul>
        <span className="font-sans text-[12px] leading-[18px] text-text-tertiary mt-1">
          App credentials (PEM, App ID) and other installations are unaffected. Re-add anytime via
          M7 auto-discover.
        </span>
      </div>
    </div>
  );
}
