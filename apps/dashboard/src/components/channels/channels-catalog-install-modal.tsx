import { useQueryClient } from '@tanstack/react-query';
import { CornerBrackets, Dialog, DialogContent, DialogTitle, Input, useToast } from '@zeno/ui';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import {
  type ChannelCatalogEntry,
  type ChannelListItem,
  type ChannelSetupHelper,
  channelsKeys,
  useChannelSetupHelper,
  useInstallChannel,
} from '@/lib/use-channels';

/**
 * Spec 0059: install modal for channels.
 *
 * Copied from connectors/catalog-install-modal.tsx and adapted per Track 4
 * audit. WHAT GETS REMOVED in the copy (kept this comment for the reviewer):
 *   - useTestCatalogConnection import + handleTest handler — channels have
 *     no test endpoint per Non-Goals.
 *   - ResultStrip + SuccessRow components — no test result to render.
 *   - The "test connection" button in Footer.
 *   - customInstallComponent routing block + registry import — channels
 *     catalog entries are all secret-form-based.
 *   - References to /api/connectors/catalog or MCP-tools rendering.
 *
 * WHAT'S NEW vs the connectors copy: a Setup helper panel rendered between
 * the catalog list and the secret form, fetched from
 * GET /api/channels/catalog/setup/:catalogId. For Slack today: 3 numbered
 * steps + the slack-app-manifest.json content with a copy button.
 */

export interface ChannelsCatalogInstallModalProps {
  open: boolean;
  onClose: () => void;
  catalog: ChannelCatalogEntry[];
}

export function ChannelsCatalogInstallModal({
  open,
  onClose,
  catalog,
}: ChannelsCatalogInstallModalProps): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(catalog[0]?.id ?? null);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const install = useInstallChannel();
  const setupHelper = useChannelSetupHelper(selectedId);
  const qc = useQueryClient();
  const toast = useToast();

  const selected = catalog.find((e) => e.id === selectedId) ?? null;

  const requiredSecretsFilled = useMemo(() => {
    if (!selected) return false;
    return selected.secrets.every((s) => !s.required || (secrets[s.key]?.length ?? 0) > 0);
  }, [selected, secrets]);

  const handleClose = (next: boolean): void => {
    if (!next && !install.isPending && !polling) onClose();
  };

  const handleSelect = (id: string): void => {
    setSelectedId(id);
    setSecrets({});
    setError(null);
  };

  const updateSecret = (key: string, value: string): void => {
    setSecrets((prev) => ({ ...prev, [key]: value }));
  };

  const handleInstall = async (): Promise<void> => {
    if (!selected || !requiredSecretsFilled) return;
    setError(null);
    try {
      await install.mutateAsync({
        catalogId: selected.id,
        secrets: Object.entries(secrets).map(([key, value]) => ({ key, value })),
      });
    } catch (err) {
      const msg = err instanceof ApiError ? extractApiError(err) : 'install failed';
      setError(msg);
      return;
    }

    // Poll up to 10s for the row to appear (success predicate: catalogId match,
    // status NOT checked — see spec 0059 Data flow — install Slack).
    setPolling(true);
    const start = Date.now();
    const targetCatalogId = selected.id;
    const displayName = selected.name;
    while (Date.now() - start < 10_000) {
      try {
        const list = await qc.fetchQuery<ChannelListItem[]>({
          queryKey: channelsKeys.list(),
          staleTime: 0,
        });
        if (list.some((c) => c.catalogId === targetCatalogId)) {
          setPolling(false);
          toast.success(`${displayName.toLowerCase()} installed`);
          qc.invalidateQueries({ queryKey: channelsKeys.list() });
          onClose();
          return;
        }
      } catch {
        // ignore; retry
      }
      await sleep(1000);
    }
    // Timeout — channel will appear once worker processes the queue
    setPolling(false);
    toast.success(`install in progress — ${displayName.toLowerCase()} will appear shortly`);
    qc.invalidateQueries({ queryKey: channelsKeys.list() });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[640px] max-h-[90vh] overflow-y-auto">
        <CornerBrackets />
        <Header />
        <div className="flex flex-col gap-6 px-7 py-[22px]">
          <CatalogList catalog={catalog} selectedId={selectedId} onSelect={handleSelect} />
          {selected && setupHelper.data ? <SetupHelperPanel helper={setupHelper.data} /> : null}
          {selected ? (
            <SecretForm entry={selected} values={secrets} onChange={updateSecret} />
          ) : null}
          {error ? <ErrorBanner message={error} /> : null}
        </div>
        <Footer
          onCancel={onClose}
          onInstall={handleInstall}
          installEnabled={requiredSecretsFilled && !install.isPending && !polling}
          installing={install.isPending || polling}
          installLabel={selected ? `install ${selected.name.toLowerCase()}` : 'install'}
        />
      </DialogContent>
    </Dialog>
  );
}

function Header(): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border-subtle pt-[22px] px-7 pb-3.5">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-gold">
          install channel
        </span>
        <DialogTitle className="m-0 font-mono text-[22px] tracking-[-0.005em] leading-7 font-medium text-text-primary">
          choose a channel to install
        </DialogTitle>
      </div>
    </div>
  );
}

function CatalogList({
  catalog,
  selectedId,
  onSelect,
}: {
  catalog: ChannelCatalogEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}): JSX.Element {
  if (catalog.length === 0) {
    return (
      <div className="bg-status-failed/[0.06] border border-status-failed/30 text-status-failed px-4 py-3 font-mono text-xs">
        Channels catalog unavailable.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-text-tertiary pb-1">
        available channels · {catalog.length}
      </span>
      {catalog.map((e) => {
        const selected = e.id === selectedId;
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => onSelect(e.id)}
            className={`flex items-center gap-3.5 px-[18px] py-4 rounded-md border transition-colors duration-[120ms] cursor-pointer ${
              selected
                ? 'bg-panel-2 border-gold'
                : 'bg-panel border-border-subtle hover:border-gold-line'
            }`}
          >
            <div className="shrink-0 w-8 h-8 bg-canvas rounded flex items-center justify-center">
              {e.iconUrl ? <img src={e.iconUrl} alt={e.name} width={20} height={20} /> : null}
            </div>
            <div className="flex-1 flex flex-col gap-0.5 text-left min-w-0">
              <span className="font-mono text-sm font-medium text-text-primary">{e.name}</span>
              <span className="font-sans text-xs text-text-secondary truncate">
                {e.description ?? '—'}
              </span>
            </div>
            {selected ? (
              <svg
                aria-hidden="true"
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-gold"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function SetupHelperPanel({ helper }: { helper: ChannelSetupHelper }): JSX.Element {
  return (
    <div className="flex flex-col gap-3.5 px-5 py-[18px] bg-canvas border border-border-subtle rounded-md">
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
          className="text-gold"
        >
          <circle cx={12} cy={12} r={10} />
          <line x1={12} y1={16} x2={12} y2={12} />
          <line x1={12} y1={8} x2={12.01} y2={8} />
        </svg>
        <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-gold">
          first time? create the slack app from this manifest
        </span>
      </div>
      <ol className="m-0 p-0 list-none flex flex-col gap-2">
        {helper.steps.map((s) => (
          <li key={s.index} className="flex items-start gap-2.5">
            <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-[18px] h-[18px] bg-panel-2 rounded-full font-mono text-[10px] font-semibold text-gold">
              {s.index}
            </span>
            <span
              className="font-sans text-[13px] leading-5 text-text-secondary [&_code]:font-mono [&_code]:text-xs [&_code]:text-gold [&_strong]:text-text-primary [&_strong]:font-medium"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted server-side HTML
              dangerouslySetInnerHTML={{ __html: s.html }}
            />
          </li>
        ))}
      </ol>
      {helper.manifest ? <ManifestBlock manifest={helper.manifest} /> : null}
    </div>
  );
}

function ManifestBlock({
  manifest,
}: {
  manifest: { filename: string; content: string };
}): JSX.Element {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(manifest.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard unavailable — show selection prompt
    }
  };
  return (
    <div className="flex flex-col bg-sidebar border border-border-subtle rounded overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-panel border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <svg
            aria-hidden="true"
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-text-tertiary"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="font-mono text-[11px] font-medium text-text-secondary">
            {manifest.filename}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-border-subtle rounded font-mono text-[10px] tracking-[0.08em] uppercase font-semibold text-gold hover:border-gold transition-colors duration-[120ms]"
        >
          <svg
            aria-hidden="true"
            width={11}
            height={11}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x={9} y={9} width={13} height={13} rx={2} ry={2} />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre className="m-0 px-4 py-3.5 font-mono text-[11px] leading-[17px] text-text-secondary whitespace-pre overflow-x-auto max-h-[220px]">
        {manifest.content}
      </pre>
    </div>
  );
}

function SecretForm({
  entry,
  values,
  onChange,
}: {
  entry: ChannelCatalogEntry;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-text-tertiary">
        {entry.name.toLowerCase()} credentials · {entry.secrets.length} required
      </span>
      {entry.secrets.map((secret) => (
        <div key={secret.key} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-xs font-medium text-text-primary">
              {secret.label}
              {secret.required ? <span className="text-status-failed ml-1">*</span> : null}
            </span>
            {secret.help ? (
              <span className="font-mono text-[11px] text-text-tertiary">{secret.help}</span>
            ) : null}
          </div>
          <Input
            type={secret.inputType === 'text' ? 'text' : 'password'}
            value={values[secret.key] ?? ''}
            onChange={(e) => onChange(secret.key, e.target.value)}
            placeholder={`paste ${secret.label.toLowerCase()}`}
            className="bg-canvas border border-border-subtle px-3.5 py-2.5 rounded font-mono text-[13px] text-text-primary"
          />
        </div>
      ))}
    </div>
  );
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
  onInstall,
  installEnabled,
  installing,
  installLabel,
}: {
  onCancel: () => void;
  onInstall: () => void;
  installEnabled: boolean;
  installing: boolean;
  installLabel: string;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 px-7 pt-4 pb-[22px] bg-sidebar border-t border-border-subtle">
      <span className="font-mono text-[11px] text-text-tertiary leading-snug max-w-[300px]">
        After install, the worker validates the catalog and binds the row. Polls up to 10s before
        showing the new card.
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
          onClick={onInstall}
          disabled={!installEnabled}
          className="inline-flex items-center gap-2 px-4 h-9 bg-gold border border-gold rounded font-mono text-xs font-semibold tracking-[0.06em] uppercase text-canvas hover:bg-gold-bright transition-colors duration-[120ms] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
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
            <path d="M12 5v14M5 12h14" />
          </svg>
          {installing ? 'installing…' : installLabel}
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
