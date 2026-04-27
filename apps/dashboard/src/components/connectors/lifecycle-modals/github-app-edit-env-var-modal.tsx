/**
 * M11 — Edit env var modal. Spec 0046.
 *
 * Renames an installation's env var. Sends PATCH /api/connectors/:id with
 * body `{envVar: 'NEW_NAME'}`. The API translates to a secrets-only patch +
 * enqueues `connector_update` → worker calls `githubApp.renameInstallation()`.
 * Applies within ~2 seconds (next command tick).
 */

import { CornerBrackets, Dialog, DialogContent, DialogTitle, Input } from '@zeno/ui';
import type { JSX } from 'react';
import { useId, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { useRenameEnvVar } from '@/lib/use-rename-env-var';

interface Props {
  appUuid: string;
  installation: {
    connectorId: string;
    displayName: string;
    envVar: string | null;
  };
  onClose: () => void;
}

const ENV_VAR_REGEX = /^[A-Z][A-Z0-9_]*$/;

export function GitHubAppEditEnvVarModal({ appUuid, installation, onClose }: Props): JSX.Element {
  const rename = useRenameEnvVar(appUuid);
  const [newEnvVar, setNewEnvVar] = useState(installation.envVar ?? '');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const helpId = useId();

  const valid = ENV_VAR_REGEX.test(newEnvVar);
  const changed = newEnvVar !== installation.envVar;
  const canSubmit = valid && changed && !rename.isPending;

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    try {
      await rename.mutateAsync({
        connectorId: installation.connectorId,
        newEnvVar,
      });
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

  const display = installation.displayName.replace(/^GitHub App — /, '');

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[560px]">
        <CornerBrackets />
        <div className="flex items-start gap-3 border-b border-border-subtle pt-[22px] px-7 pb-3.5">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-gold">
              edit · env var
            </span>
            <DialogTitle className="m-0 font-serif text-[22px] tracking-[-0.015em] leading-7 text-text-primary">
              Rename env var for <em className="italic text-gold">{display}</em>
            </DialogTitle>
          </div>
        </div>
        <div className="flex flex-col gap-[18px] px-7 py-[22px]">
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.18em] leading-3 uppercase text-gold">
              current
            </span>
            <span className="font-mono text-[13px] line-through text-text-tertiary">
              {installation.envVar ?? '—'}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={inputId}
              className="font-mono text-[10px] tracking-[0.18em] leading-3 uppercase text-gold"
            >
              new
            </label>
            <Input
              id={inputId}
              type="text"
              value={newEnvVar}
              onChange={(e) => setNewEnvVar(e.target.value)}
              placeholder="ACME_GH_TOKEN"
              aria-describedby={helpId}
              aria-invalid={newEnvVar.length > 0 && !valid}
              className={`bg-panel-2 border ${
                newEnvVar.length > 0 && !valid
                  ? 'border-status-failed/50'
                  : changed && valid
                    ? 'border-gold-line'
                    : 'border-border-subtle'
              } px-3 py-2.5 font-mono text-[13px] text-text-primary`}
            />
            <span id={helpId} className="font-mono text-[11px] leading-[14px] text-text-tertiary">
              UPPER_SNAKE_CASE. Must start with a letter; allowed: A-Z 0-9 _
            </span>
          </div>
          <Warning />
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
            className="inline-flex items-center px-3.5 py-2 bg-gold border border-gold font-mono text-xs font-semibold tracking-[0.06em] leading-4 uppercase text-text-ink hover:bg-gold-bright hover:border-gold-bright transition-colors duration-[120ms] disabled:opacity-50"
          >
            {rename.isPending ? 'saving…' : 'save'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Warning(): JSX.Element {
  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-gold/10 border border-gold-line border-l-2 border-l-gold">
      <span className="font-mono text-xs leading-4 text-gold mt-0.5">i</span>
      <div className="flex-1 flex flex-col gap-1">
        <span className="font-sans text-[13px] leading-5 text-text-primary">
          Applies within ~2 seconds (next command tick). Skills mid-execution may briefly see the
          old name unset; restart Slack message processing if you hit a missing-env-var error
          shortly after rename.
        </span>
      </div>
    </div>
  );
}
