import { CornerBrackets, Dialog, DialogContent, DialogTitle, Input } from '@zeno/ui';
import type { JSX } from 'react';
import { useState } from 'react';
import { ApiError } from '@/lib/api-client';
import {
  type ChannelCatalogEntry,
  type ChannelDetail,
  useEditChannelSecrets,
} from '@/lib/use-channels';

/**
 * Spec 0059: edit secrets modal (Paper artboard M-ch-2).
 *
 * Each input opens EMPTY. Placeholder shows the masked last4 so the operator
 * knows what's currently set. On submit, only fields with a non-empty value
 * are sent to PATCH /api/channels/:id/secrets with mode='merge' — the
 * backend overlays them onto the existing secret set, preserving keys the
 * operator didn't touch. UI never reads plaintext for unchanged values.
 */
export interface ChannelsEditSecretsModalProps {
  open: boolean;
  onClose: () => void;
  channel: ChannelDetail;
  catalogEntry: ChannelCatalogEntry | null;
}

export function ChannelsEditSecretsModal({
  open,
  onClose,
  channel,
  catalogEntry,
}: ChannelsEditSecretsModalProps): JSX.Element {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const editSecrets = useEditChannelSecrets();

  const last4ByKey = new Map(channel.secrets.map((s) => [s.key, s.last4]));
  // Render fields based on catalog schema (or fall back to keys actually present
  // on the channel if the catalog entry isn't loaded yet).
  const fields = catalogEntry
    ? catalogEntry.secrets
    : channel.secrets.map((s) => ({
        key: s.key,
        label: s.key,
        help: undefined,
        required: false,
        inputType: 'password' as const,
      }));

  const handleClose = (next: boolean): void => {
    if (!next && !editSecrets.isPending) {
      setValues({});
      setError(null);
      onClose();
    }
  };

  const updateValue = (key: string, value: string): void => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (): Promise<void> => {
    setError(null);
    const submitted = Object.entries(values)
      .filter(([, v]) => v.length > 0)
      .map(([key, value]) => ({ key, value }));
    if (submitted.length === 0) {
      // nothing to change — close the modal cleanly
      onClose();
      return;
    }
    try {
      await editSecrets.mutateAsync({
        channelId: channel.id,
        secrets: submitted,
      });
      setValues({});
      onClose();
    } catch (err) {
      const msg = err instanceof ApiError ? extractApiError(err) : 'save failed';
      setError(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[640px]">
        <CornerBrackets />
        <Header displayName={channel.displayName} />
        <div className="flex flex-col gap-[18px] px-7 py-[22px]">
          {fields.map((field) => {
            const last4 = last4ByKey.get(field.key);
            const filled = (values[field.key]?.length ?? 0) > 0;
            return (
              <div key={field.key} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-xs font-medium text-text-primary tracking-[0.04em]">
                    {field.label || field.key}
                  </span>
                  {filled ? (
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium text-gold">
                      <span className="w-1.5 h-1.5 rounded-full bg-gold" />
                      will replace
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] text-text-tertiary">
                      leave empty · keeps current value
                    </span>
                  )}
                </div>
                <Input
                  type={field.inputType === 'text' ? 'text' : 'password'}
                  value={values[field.key] ?? ''}
                  onChange={(e) => updateValue(field.key, e.target.value)}
                  placeholder={
                    last4
                      ? `currently set · ••••${last4} · leave empty to keep`
                      : `paste new ${field.label || field.key}`
                  }
                  className={`px-3.5 py-2.5 rounded font-mono text-[13px] text-text-primary bg-canvas border ${
                    filled ? 'border-gold' : 'border-border-subtle'
                  }`}
                />
              </div>
            );
          })}
          <DiffHint values={values} />
          {error ? <ErrorBanner message={error} /> : null}
        </div>
        <Footer onCancel={onClose} onSave={handleSave} saving={editSecrets.isPending} />
      </DialogContent>
    </Dialog>
  );
}

function Header({ displayName }: { displayName: string }): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border-subtle pt-[22px] px-7 pb-3.5">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-gold">
          edit secrets · {displayName.toLowerCase()}
        </span>
        <DialogTitle className="m-0 font-mono text-[22px] tracking-[-0.005em] leading-7 font-medium text-text-primary">
          rotate or replace tokens
        </DialogTitle>
        <p className="m-0 mt-1 font-sans text-[13px] leading-5 text-text-secondary">
          Empty fields are <code className="font-mono text-xs text-gold">kept</code> (mode='merge').
          Filled fields <code className="font-mono text-xs text-gold">replace</code>. Plaintext is
          never read by the UI for unchanged values.
        </p>
      </div>
    </div>
  );
}

function DiffHint({ values }: { values: Record<string, string> }): JSX.Element | null {
  const changedKeys = Object.entries(values)
    .filter(([, v]) => v.length > 0)
    .map(([k]) => k);
  if (changedKeys.length === 0) return null;
  const submittedJson = `{ mode: 'merge', secrets: [${changedKeys
    .map((k) => `{ key: '${k}', value: '${maskValue(values[k] ?? '')}' }`)
    .join(', ')}] }`;
  return (
    <div className="flex flex-col gap-1.5 px-3.5 py-3 bg-canvas border border-border-subtle rounded">
      <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-text-tertiary">
        on submit
      </span>
      <span className="font-mono text-xs text-text-secondary leading-snug break-all">
        PATCH /api/channels/&lt;id&gt;/secrets <span className="text-gold">{submittedJson}</span>
      </span>
    </div>
  );
}

function maskValue(value: string): string {
  if (value.length <= 4) return '****';
  return `${value.slice(0, 6)}…`;
}

function ErrorBanner({ message }: { message: string }): JSX.Element {
  return (
    <div className="flex items-start gap-2.5 px-3.5 py-2.5 bg-status-failed/[0.06] border border-status-failed/30 rounded">
      <span className="font-mono text-xs text-status-failed">!</span>
      <span className="flex-1 font-mono text-xs text-text-primary leading-snug">{message}</span>
    </div>
  );
}

function Footer({
  onCancel,
  onSave,
  saving,
}: {
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 px-7 pt-4 pb-[22px] bg-sidebar border-t border-border-subtle">
      <span className="font-mono text-[11px] text-text-tertiary leading-snug max-w-[260px]">
        Sync write — changes land before the worker's next boot.
      </span>
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center px-4 h-9 border border-border-subtle rounded font-mono text-xs font-medium tracking-[0.06em] uppercase text-text-secondary hover:bg-panel-2 transition-colors duration-[120ms] whitespace-nowrap"
        >
          cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 h-9 bg-gold border border-gold rounded font-mono text-xs font-semibold tracking-[0.06em] uppercase text-canvas hover:bg-gold-bright transition-colors duration-[120ms] disabled:opacity-50 whitespace-nowrap"
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
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {saving ? 'saving…' : 'save secrets'}
        </button>
      </div>
    </div>
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
