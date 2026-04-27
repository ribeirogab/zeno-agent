/**
 * M6 — Install GitHub App modal. Spec 0045.
 *
 * Two-step flow:
 *   1. App ID + PEM → click TEST CONNECTION → backend signs JWT, calls /app,
 *      returns `{ok, appName, appSlug, installationsAvailable}`.
 *   2. INSTALL APP → POST /catalog/github-app/install → backend writes
 *      connector_apps row + enqueues app_install command.
 *
 * 409 path: backend returns "app_already_installed" → display inline link to
 * `/connectors/github-app`.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CornerBrackets, Dialog, DialogContent, DialogTitle, Input } from '@zeno/ui';
import type { JSX } from 'react';
import { useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api-client';

interface TestResponse {
  ok: boolean;
  appName?: string;
  appSlug?: string;
  installationsAvailable?: Array<{
    name: string;
    id: string;
    accountType: string;
    repoCount: number | null;
  }>;
  errorKind?: string;
  error?: string;
}

interface InstallResponse {
  ok: boolean;
  appUuid?: string;
  appName?: string;
  appSlug?: string;
  errorKind?: string;
  error?: string;
}

export function GitHubAppInstallModal({
  onClose,
}: {
  catalogId: string;
  onClose: () => void;
}): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [appId, setAppId] = useState('');
  const [pem, setPem] = useState('');
  const [testing, setTesting] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [testResult, setTestResult] = useState<TestResponse | null>(null);
  const [error, setError] = useState<{ message: string; alreadyInstalled?: boolean } | null>(null);

  const handleClose = (open: boolean): void => {
    if (!open) onClose();
  };

  const handleTest = async (): Promise<void> => {
    if (!appId || !pem) return;
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const result = await apiFetch<TestResponse>('/api/connectors/catalog/github-app/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId, pem }),
      });
      setTestResult(result);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  };

  const handleInstall = async (): Promise<void> => {
    if (!appId || !pem) return;
    setInstalling(true);
    setError(null);
    try {
      const result = await apiFetch<InstallResponse>('/api/connectors/catalog/github-app/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId, pem }),
      });
      if (result.ok) {
        // Refresh listing so the App row appears.
        await queryClient.invalidateQueries({ queryKey: ['connectors'] });
        await queryClient.invalidateQueries({ queryKey: ['app'] });
        onClose();
        navigate({ to: '/connectors/github-app' });
        return;
      }
      // 200 with ok=false is the validation-error path (auth/network/etc.).
      setError({
        message: result.error ?? 'install failed',
      });
    } catch (err) {
      // apiFetch throws ApiError on non-2xx. 409 = already-installed sentinel.
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { error?: string; existingAppName?: string } | null;
        setError({
          message: body?.existingAppName
            ? `GitHub App "${body.existingAppName}" already installed`
            : 'GitHub App already installed',
          alreadyInstalled: true,
        });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      setError({ message });
    } finally {
      setInstalling(false);
    }
  };

  const installEnabled = !!testResult?.ok && !installing;

  return (
    <Dialog open={true} onOpenChange={handleClose}>
      <DialogContent className="w-[640px]">
        <CornerBrackets />
        <Header />
        <div className="flex flex-col gap-[18px] px-7 py-[22px]">
          <Field
            label="App ID"
            help="Numeric app id from your GitHub App settings (e.g. 12345)."
            value={appId}
            onChange={setAppId}
            placeholder="12345"
            mono
          />
          <PemField pem={pem} onChange={setPem} />
          <ResultStrip result={testResult} testing={testing} />
          {error && <ErrorStrip error={error} />}
        </div>
        <Footer
          onCancel={onClose}
          onTest={handleTest}
          onInstall={handleInstall}
          testing={testing}
          installEnabled={installEnabled}
          installing={installing}
          appId={appId}
          hasPem={!!pem}
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
          install · github app
        </span>
        <DialogTitle className="m-0 font-serif text-[22px] tracking-[-0.015em] leading-7 text-text-primary">
          Add <em className="italic text-gold">GitHub App</em>
        </DialogTitle>
        <div className="flex items-center gap-2.5 mt-1">
          <span className="inline-flex items-center px-2 py-0.5 border border-border-subtle font-mono text-[10px] tracking-[0.1em] leading-3 uppercase text-text-tertiary">
            github · app
          </span>
          <span className="font-sans text-xs leading-4 text-text-secondary">
            One App, many installations. Test the credentials, then install.
          </span>
        </div>
      </div>
      <span className="shrink-0 w-12 h-12 inline-flex items-center justify-center bg-text-primary border border-gold-line">
        <img src="/api/connectors/catalog/icons/github.svg" alt="GitHub" width={24} height={24} />
      </span>
    </div>
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
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] tracking-[0.18em] leading-3 uppercase text-gold">
        {label}
      </span>
      <Input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`bg-panel-2 border border-border-subtle px-3 py-2.5 ${
          mono ? 'font-mono' : 'font-sans'
        } text-[13px] text-text-primary`}
      />
      <span className="font-mono text-[11px] leading-[14px] text-text-tertiary">{help}</span>
    </div>
  );
}

function PemField({ pem, onChange }: { pem: string; onChange: (v: string) => void }): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] tracking-[0.18em] leading-3 uppercase text-gold">
        PEM (RSA private key)
      </span>
      <textarea
        value={pem}
        placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;..."
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        className="bg-panel-2 border border-border-subtle px-3 py-2.5 font-mono text-[11px] leading-[14px] text-text-primary"
      />
      <span className="font-mono text-[11px] leading-[14px] text-text-tertiary">
        Paste the PEM you downloaded from your GitHub App settings. Stored encrypted at rest; only
        the SHA-256 fingerprint is shown to you after install.
      </span>
    </div>
  );
}

function ResultStrip({
  result,
  testing,
}: {
  result: TestResponse | null;
  testing: boolean;
}): JSX.Element | null {
  if (testing) {
    return (
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-gold/10 border border-gold-line border-l-2 border-l-gold">
        <span className="font-mono text-xs leading-4 text-gold">…</span>
        <span className="flex-1 font-mono text-xs leading-4 text-text-primary">
          signing JWT · calling /app · listing installations…
        </span>
      </div>
    );
  }
  if (!result) return null;
  if (result.ok) {
    const installs = result.installationsAvailable ?? [];
    return (
      <div className="flex flex-col gap-1.5 px-3.5 py-2.5 bg-status-active/[0.06] border border-status-active/30 border-l-2 border-l-status-active">
        <span className="font-mono text-xs leading-4 text-status-active">
          ✓ credentials valid · {result.appName}
          {installs.length > 0 ? ` · ${installs.length} installation(s) available` : ''}
        </span>
        {installs.length > 0 && (
          <span className="font-mono text-[11px] leading-[14px] text-text-tertiary">
            {installs.map((i) => i.name).join(' · ')}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-status-failed/[0.06] border border-status-failed/30 border-l-2 border-l-status-failed">
      <span className="font-mono text-xs leading-4 text-status-failed">✗</span>
      <span className="flex-1 font-mono text-xs leading-4 text-text-primary">
        {result.error}
        {result.errorKind === 'auth' && ' — check the App ID + PEM pair'}
      </span>
    </div>
  );
}

function ErrorStrip({
  error,
}: {
  error: { message: string; alreadyInstalled?: boolean };
}): JSX.Element {
  if (error.alreadyInstalled) {
    return (
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-gold/10 border border-gold-line border-l-2 border-l-gold">
        <span className="font-mono text-xs leading-4 text-gold">!</span>
        <span className="flex-1 font-mono text-xs leading-4 text-text-primary">
          GitHub App already installed ·{' '}
          <a href="/connectors/github-app" className="text-gold underline">
            view details ↗
          </a>
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-status-failed/[0.06] border border-status-failed/30 border-l-2 border-l-status-failed">
      <span className="font-mono text-xs leading-4 text-status-failed">✗</span>
      <span className="flex-1 font-mono text-xs leading-4 text-text-primary">{error.message}</span>
    </div>
  );
}

function Footer({
  onCancel,
  onTest,
  onInstall,
  testing,
  installEnabled,
  installing,
  appId,
  hasPem,
}: {
  onCancel: () => void;
  onTest: () => void;
  onInstall: () => void;
  testing: boolean;
  installEnabled: boolean;
  installing: boolean;
  appId: string;
  hasPem: boolean;
}): JSX.Element {
  const testEnabled = !!appId && hasPem && !testing;
  return (
    <div className="flex items-center justify-between gap-2.5 bg-sidebar border-t border-border-subtle px-7 pt-4 pb-[22px]">
      <span className="font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary">
        {!testEnabled ? 'fill App ID + PEM' : installEnabled ? 'ready to install' : 'test first'}
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
          disabled={!testEnabled}
          className="inline-flex items-center px-3.5 py-2 border border-gold-line font-mono text-xs font-medium tracking-[0.06em] leading-4 uppercase text-gold hover:bg-gold-soft hover:border-gold transition-colors duration-[120ms] disabled:opacity-50"
        >
          {testing ? 'testing…' : 'test connection'}
        </button>
        <button
          type="button"
          onClick={onInstall}
          disabled={!installEnabled}
          className="inline-flex items-center px-3.5 py-2 bg-gold border border-gold font-mono text-xs font-semibold tracking-[0.06em] leading-4 uppercase text-text-ink hover:bg-gold-bright hover:border-gold-bright transition-colors duration-[120ms] disabled:opacity-50"
        >
          {installing ? 'installing…' : 'install app'}
        </button>
      </div>
    </div>
  );
}
