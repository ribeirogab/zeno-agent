import { CornerBrackets, Dialog, DialogContent, DialogTitle, Input } from '@zeno/ui';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import {
  type DiscoveredToolApi,
  type TestConnectionResponse,
  useCreateCatalogConnector,
  useTestCatalogConnection,
} from '@/lib/connector-mutations';
import { type CatalogEntryApi, useCatalog } from '@/lib/use-catalog';

export interface CatalogInstallModalProps {
  catalogId: string;
  onClose: () => void;
}

export function CatalogInstallModal({
  catalogId,
  onClose,
}: CatalogInstallModalProps): JSX.Element | null {
  const catalog = useCatalog();
  const entry: CatalogEntryApi | undefined = catalog.data?.find((e) => e.id === catalogId);
  const test = useTestCatalogConnection();
  const create = useCreateCatalogConnector();

  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<TestConnectionResponse | null>(null);
  const [dirtySinceTest, setDirtySinceTest] = useState(false);

  const handleClose = (open: boolean): void => {
    if (!open) onClose();
  };

  const updateSecret = (key: string, value: string): void => {
    setSecrets((prev) => ({ ...prev, [key]: value }));
    if (testResult?.ok) setDirtySinceTest(true);
  };

  const handleTest = async (): Promise<void> => {
    if (!entry) return;
    setTestResult(null);
    setDirtySinceTest(false);
    // The catalog flow uses /api/connectors/catalog/:id/test — the server
    // resolves transportConfig from the catalog entry so the dashboard only
    // needs to send the secrets.
    const result = await test.mutateAsync({
      catalogId: entry.id,
      secrets: Object.entries(secrets).map(([key, value]) => ({ key, value })),
    });
    setTestResult(result);
  };

  const handleAdd = async (): Promise<void> => {
    if (!entry) return;
    await create.mutateAsync({
      catalogId: entry.id,
      secrets: Object.entries(secrets).map(([key, value]) => ({ key, value })),
    });
    onClose();
  };

  const requiredSecretsFilled = useMemo(() => {
    if (!entry) return false;
    return entry.secrets.every(
      (secret) => !secret.required || (secrets[secret.key]?.length ?? 0) > 0,
    );
  }, [entry, secrets]);

  const addEnabled = requiredSecretsFilled && !create.isPending;

  if (!entry) {
    return (
      <Dialog open={true} onOpenChange={handleClose}>
        <DialogContent className="w-[560px]">
          <DialogTitle className="m-0 font-serif text-[22px] text-text-primary px-7 pt-6">
            Loading…
          </DialogTitle>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={true} onOpenChange={handleClose}>
      <DialogContent className="w-[560px]">
        <CornerBrackets />
        <Header entry={entry} />
        <div className="flex flex-col gap-[18px] px-7 py-[22px]">
          {entry.secrets.map((secret) => (
            <SecretField
              key={secret.key}
              label={secret.label}
              help={secret.help}
              required={secret.required}
              value={secrets[secret.key] ?? ''}
              onChange={(v) => updateSecret(secret.key, v)}
            />
          ))}
          <ResultStrip result={testResult} dirty={dirtySinceTest} isPending={test.isPending} />
        </div>
        <Footer
          onCancel={onClose}
          onTest={handleTest}
          onAdd={handleAdd}
          testing={test.isPending}
          addEnabled={addEnabled}
          adding={create.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}

function Header({ entry }: { entry: CatalogEntryApi }): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border-subtle pt-[22px] px-7 pb-3.5">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-gold">
          install · catalog
        </span>
        <DialogTitle className="m-0 font-serif text-[22px] tracking-[-0.015em] leading-7 text-text-primary">
          Add <em className="italic text-gold">{entry.name}</em>
        </DialogTitle>
        <div className="flex items-center gap-2.5 mt-1">
          <span className="inline-flex items-center px-2 py-0.5 border border-border-subtle font-mono text-[10px] tracking-[0.1em] leading-3 uppercase text-text-tertiary">
            {entry.transport}
          </span>
          <span className="font-sans text-xs leading-4 text-text-secondary">
            {entry.description}
          </span>
          {entry.docsUrl && (
            <a
              href={entry.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[10px] tracking-[0.08em] leading-3 uppercase text-gold"
            >
              learn more ↗
            </a>
          )}
        </div>
      </div>
      <img
        src={entry.iconUrl}
        alt={entry.name}
        width={48}
        height={48}
        className="shrink-0 w-12 h-12 block"
      />
    </div>
  );
}

function SecretField({
  label,
  help,
  required,
  value,
  onChange,
}: {
  label: string;
  help: string;
  required: boolean;
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] tracking-[0.18em] leading-3 uppercase text-gold">
        {label}
        {required && <span className="text-status-failed ml-1">*</span>}
      </span>
      <Input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-panel-2 border border-border-subtle px-3 py-2.5 font-mono text-[13px] text-text-primary"
      />
      <span className="font-mono text-[11px] leading-[14px] text-text-tertiary">{help}</span>
    </div>
  );
}

function ResultStrip({
  result,
  dirty,
  isPending,
}: {
  result: TestConnectionResponse | null;
  dirty: boolean;
  isPending: boolean;
}): JSX.Element | null {
  if (isPending) {
    return (
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-gold/10 border border-gold-line border-l-2 border-l-gold">
        <span className="font-mono text-xs leading-4 text-gold">…</span>
        <span className="flex-1 font-mono text-xs leading-4 text-text-primary">
          testing connection…
        </span>
      </div>
    );
  }
  if (!result) return null;
  if (result.ok) {
    if (dirty) {
      return (
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-gold/10 border border-gold-line border-l-2 border-l-gold">
          <span className="flex-1 font-mono text-xs leading-4 text-gold">
            credentials changed · re-test required
          </span>
        </div>
      );
    }
    return <SuccessRow result={result} />;
  }
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-status-failed/[0.06] border border-status-failed/30 border-l-2 border-l-status-failed">
      <span className="font-mono text-xs leading-4 text-status-failed">✗</span>
      <span className="flex-1 font-mono text-xs leading-4 text-text-primary">
        {result.error}
        {result.errorKind === 'auth' && ' — check your API key'}
        {result.errorKind === 'network' && ' — check the URL is reachable'}
      </span>
    </div>
  );
}

function SuccessRow({
  result,
}: {
  result: { tools: DiscoveredToolApi[]; durationMs: number };
}): JSX.Element {
  const counts = result.tools.reduce(
    (acc, t) => {
      acc[t.category]++;
      return acc;
    },
    { read: 0, write: 0, interactive: 0 },
  );
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-status-active/[0.06] border border-status-active/30 border-l-2 border-l-status-active">
      <span className="font-mono text-xs leading-4 text-status-active">✓</span>
      <span className="flex-1 font-mono text-xs leading-4 text-text-primary">
        {result.tools.length} tools detected · {counts.read} read · {counts.write} write/delete ·{' '}
        {counts.interactive} interactive
      </span>
      <span className="font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary">
        {result.durationMs}ms
      </span>
    </div>
  );
}

function Footer({
  onCancel,
  onTest,
  onAdd,
  testing,
  addEnabled,
  adding,
}: {
  onCancel: () => void;
  onTest: () => void;
  onAdd: () => void;
  testing: boolean;
  addEnabled: boolean;
  adding: boolean;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2.5 bg-sidebar border-t border-border-subtle px-7 pt-4 pb-[22px]">
      <span className="font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary">
        {addEnabled ? 'ready to install' : 'fill required fields'}
      </span>
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center px-3.5 py-2 border border-border-strong font-mono text-xs font-medium tracking-[0.06em] leading-4 uppercase text-text-primary hover:bg-panel-2 transition-colors duration-[120ms]"
        >
          cancel
        </button>
        <button
          type="button"
          onClick={onTest}
          disabled={testing}
          className="inline-flex items-center px-3.5 py-2 border border-gold-line font-mono text-xs font-medium tracking-[0.06em] leading-4 uppercase text-gold hover:bg-gold-soft hover:border-gold transition-colors duration-[120ms] disabled:opacity-50"
        >
          {testing ? 'testing…' : 'test connection'}
        </button>
        <button
          type="button"
          onClick={onAdd}
          disabled={!addEnabled || adding}
          className="inline-flex items-center px-3.5 py-2 bg-gold border border-gold font-mono text-xs font-semibold tracking-[0.06em] leading-4 uppercase text-text-ink hover:bg-gold-bright hover:border-gold-bright transition-colors duration-[120ms] disabled:opacity-50"
        >
          {adding ? 'adding…' : 'add'}
        </button>
      </div>
    </div>
  );
}
