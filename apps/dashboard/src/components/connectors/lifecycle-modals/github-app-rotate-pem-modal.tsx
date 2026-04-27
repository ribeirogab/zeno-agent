/**
 * M9 — Rotate PEM modal. Spec 0046.
 *
 * Destructive (key rotation). Body:
 *   - PEM dropzone for the new key
 *   - Type-to-confirm the App ID (numeric, mono)
 *   - ROTATE KEY (red CTA)
 *
 * The backend pre-validates by signing a JWT with the new key, calling /app
 * (must return same appId), and minting a test token for every installation.
 * If any check fails, the rotation does NOT happen.
 */

import { CornerBrackets, Dialog, DialogContent, DialogTitle } from '@zeno/ui';
import type { JSX } from 'react';
import { useState } from 'react';
import { PemDropzone } from '@/components/shared/pem-dropzone';
import { TypeToConfirm } from '@/components/shared/type-to-confirm';
import { ApiError } from '@/lib/api-client';
import { useRotatePem } from '@/lib/use-rotate-pem';

interface Props {
  appUuid: string;
  appId: string;
  appName: string;
  onClose: () => void;
}

export function GitHubAppRotatePemModal({ appUuid, appId, appName, onClose }: Props): JSX.Element {
  const rotate = useRotatePem(appUuid);
  const [pem, setPem] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const matches = confirm === appId;
  const looksLikePem = /-----BEGIN (RSA )?PRIVATE KEY-----/.test(pem);
  const canSubmit = looksLikePem && matches && !rotate.isPending;

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    try {
      const res = await rotate.mutateAsync({ newPem: pem, confirmAppId: appId });
      if (res.ok) {
        onClose();
      } else {
        setError(res.error ?? 'rotation failed');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { error?: string; errorKind?: string } | null;
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
          <Warning />
          <PemDropzone
            value={pem}
            onChange={setPem}
            label="new PEM"
            help="Paste, drop, or pick the new private key. The old key keeps working until rotation completes."
          />
          <TypeToConfirm
            label={`type the App ID "${appId}" to confirm`}
            expected={appId}
            value={confirm}
            onChange={setConfirm}
            mono
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
            {rotate.isPending ? 'rotating…' : 'rotate key'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Header({ appName }: { appName: string }): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border-subtle pt-[22px] px-7 pb-3.5">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-status-failed">
          rotate · destructive
        </span>
        <DialogTitle className="m-0 font-serif text-[22px] tracking-[-0.015em] leading-7 text-text-primary">
          Rotate PEM for <em className="italic text-gold">{appName}</em>
        </DialogTitle>
      </div>
    </div>
  );
}

function Warning(): JSX.Element {
  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-status-failed/[0.04] border border-status-failed/30 border-l-2 border-l-status-failed">
      <span className="font-mono text-xs leading-4 text-status-failed mt-0.5">!</span>
      <div className="flex-1 flex flex-col gap-1">
        <span className="font-mono text-[11px] tracking-[0.06em] leading-[14px] uppercase text-status-failed">
          irreversible
        </span>
        <span className="font-sans text-[13px] leading-5 text-text-primary">
          The backend will validate the new key by signing a JWT, calling /app, and minting a test
          token for every installation. If any installation rejects the new key, rotation aborts and
          the old key stays. Skills mid-execution finish with their cached tokens (~50 min
          remaining); new turns use the new key.
        </span>
      </div>
    </div>
  );
}
