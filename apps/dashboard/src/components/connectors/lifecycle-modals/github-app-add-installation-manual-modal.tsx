/**
 * M8 — Add Installation manual fallback. Spec 0046; spec 0051 dropped the
 * envVar field.
 *
 * Used when the auto-discover list is empty or the user has a specific
 * installationId to add. Two fields: displayName, installationId. No "TEST"
 * button — the backend will reject if the installation doesn't exist (the
 * worker handler mints a token at first use).
 */

import { CornerBrackets, Dialog, DialogContent, DialogTitle, Input } from '@zeno/ui';
import type { JSX } from 'react';
import { useId, useState } from 'react';
import { useAddInstallation } from '@/lib/use-add-installation';

interface Props {
  appUuid: string;
  appName: string;
  onClose: () => void;
  onBack: () => void;
}

export function GitHubAppAddInstallationManualModal({
  appUuid,
  appName,
  onClose,
  onBack,
}: Props): JSX.Element {
  const add = useAddInstallation(appUuid);
  const [installationId, setInstallationId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canSubmit = installationId.trim() && displayName.trim() && !add.isPending;

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    try {
      await add.mutateAsync({ installationId, displayName });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[560px]">
        <CornerBrackets />
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle pt-[22px] px-7 pb-3.5">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-gold">
              add · manual
            </span>
            <DialogTitle className="m-0 font-serif text-[22px] tracking-[-0.015em] leading-7 text-text-primary">
              Add to <em className="italic text-gold">{appName}</em>
            </DialogTitle>
            <span className="font-sans text-xs leading-4 text-text-secondary">
              Skip auto-discovery and enter the installation manually.
            </span>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="font-mono text-[10px] tracking-[0.08em] uppercase text-gold hover:underline"
          >
            ← auto-discover
          </button>
        </div>
        <div className="flex flex-col gap-[18px] px-7 py-[22px]">
          <Field
            label="display name"
            help="Shown in the dashboard. e.g. 'Acme Corp', 'FlaviaNasser'."
            value={displayName}
            onChange={setDisplayName}
            placeholder="Acme Corp"
          />
          <Field
            label="installation id"
            help="Numeric installation id from /settings/installations on GitHub."
            value={installationId}
            onChange={setInstallationId}
            placeholder="125887887"
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
            className="inline-flex items-center px-3.5 py-2 bg-gold border border-gold font-mono text-xs font-semibold tracking-[0.06em] leading-4 uppercase text-text-ink hover:bg-gold-bright hover:border-gold-bright transition-colors duration-[120ms] disabled:opacity-50"
          >
            {add.isPending ? 'adding…' : '+ add installation'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  help,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string;
  help: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}): JSX.Element {
  const inputId = useId();
  const helpId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className="font-mono text-[10px] tracking-[0.18em] leading-3 uppercase text-gold"
      >
        {label}
      </label>
      <Input
        id={inputId}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={helpId}
        className={`bg-panel-2 border border-border-subtle px-3 py-2.5 ${mono ? 'font-mono' : 'font-sans'} text-[13px] text-text-primary`}
      />
      <span id={helpId} className="font-mono text-[11px] leading-[14px] text-text-tertiary">
        {help}
      </span>
    </div>
  );
}
