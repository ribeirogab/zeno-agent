/**
 * Spec 0071: Configure Claude modal — auto-OAuth flow + paste fallback.
 *
 * State machine (per Paper artboards `0071 · M-configure-claude *`):
 *   idle → click "Connect Claude" → POST /oauth/start → waiting (SSE)
 *     ↓ device_code_url event → render OAuth link card
 *     ↓ token_captured + verifying → spinner card
 *     ↓ success → done state (Done button closes modal)
 *     ↓ error{kind} → error variant (cli / unauthorized / rate_limited / network)
 *   idle → click "paste manually instead" → paste form
 *     ↓ Save & Test → POST /credentials → done OR inline error
 */

import { Dialog, DialogContent } from '@zeno/ui';
import type { FormEvent, JSX } from 'react';
import { useState } from 'react';
import {
  type BackendListItem,
  type BackendStatus,
  useSaveBackendCredentials,
  useStartOAuth,
} from '@/lib/use-backends';
import { useOAuthSession } from '@/lib/use-oauth-session';

export interface ConfigureModalProps {
  backend: BackendListItem;
  open: boolean;
  /** Called with the next open state — `false` on close (X click, click-outside, Esc). */
  onOpenChange: (open: boolean) => void;
  onSuccess?: (status: BackendStatus) => void;
}

type View = 'auto' | 'paste';

export function ConfigureModal({
  backend,
  open,
  onOpenChange,
  onSuccess,
}: ConfigureModalProps): JSX.Element {
  const [view, setView] = useState<View>('auto');
  const oauth = useOAuthSession();
  const startOAuth = useStartOAuth();
  const save = useSaveBackendCredentials();

  const handleConnect = async () => {
    const { session_id } = await startOAuth.mutateAsync(backend.id);
    oauth.start({ backendId: backend.id, sessionId: session_id });
  };

  const handleClose = () => {
    oauth.cancel(backend.id);
    setView('auto');
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
        else onOpenChange(true);
      }}
    >
      <DialogContent width="w-[640px] max-w-[calc(100vw-32px)]">
        {/* Title bar */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-panel-2 flex items-center justify-center overflow-hidden">
              <img src={backend.logoUrl} alt="" className="w-6 h-6 object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-text-tertiary">
                configure backend
              </span>
              <span className="font-sans text-[16px] font-medium text-text-primary">
                {backend.id}
              </span>
            </div>
          </div>
        </div>

        {/* Body */}
        {view === 'paste' ? (
          <PasteFlow
            backend={backend}
            onSwitchToAuto={() => setView('auto')}
            onSuccess={(status) => {
              onSuccess?.(status);
              handleClose();
            }}
            saving={save.isPending}
            onSave={(token) => save.mutateAsync({ backendId: backend.id, token })}
          />
        ) : (
          <AutoFlow
            backend={backend}
            state={oauth.state}
            onConnect={handleConnect}
            onCancel={() => oauth.cancel(backend.id)}
            onRetry={() => {
              oauth.reset();
            }}
            onSwitchToPaste={() => {
              oauth.cancel(backend.id);
              setView('paste');
            }}
            onDone={() => {
              onSuccess?.('active');
              handleClose();
            }}
            onSubmitCode={(code) => oauth.submitCode(backend.id, code)}
            starting={startOAuth.isPending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────
// Auto-OAuth view
// ─────────────────────────────────────────────────────────────────

function AutoFlow({
  state,
  onConnect,
  onCancel,
  onRetry,
  onSwitchToPaste,
  onDone,
  onSubmitCode,
  starting,
}: {
  backend: BackendListItem;
  state: ReturnType<typeof useOAuthSession>['state'];
  onConnect: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onSwitchToPaste: () => void;
  onDone: () => void;
  onSubmitCode: (code: string) => void | Promise<void>;
  starting: boolean;
}): JSX.Element {
  if (state.kind === 'idle') {
    return (
      <div className="p-6 flex flex-col items-start gap-6">
        <div className="flex flex-col gap-2.5">
          <p className="font-sans text-[15px] text-text-primary leading-6">
            Re-authenticate Claude. We&apos;ll open Anthropic&apos;s OAuth in a new tab — no
            terminal needed.
          </p>
          <p className="font-mono text-[11px] tracking-[0.08em] uppercase text-text-tertiary">
            opens claude.ai oauth · token stored encrypted (aes-256-gcm)
          </p>
        </div>
        <button
          type="button"
          onClick={onConnect}
          disabled={starting}
          className="inline-flex items-center justify-center gap-2.5 px-7 py-3.5 bg-gold text-text-ink font-mono text-[11px] font-medium tracking-[0.08em] uppercase rounded-md hover:bg-gold-bright disabled:opacity-60"
        >
          <span className="font-mono text-[13px]">→</span>
          <span>{starting ? 'starting...' : 'connect claude'}</span>
        </button>
        <button
          type="button"
          onClick={onSwitchToPaste}
          className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.08em] uppercase text-text-secondary hover:text-text-primary"
        >
          <span>›</span>
          <span>paste a token manually instead</span>
        </button>
      </div>
    );
  }
  if (state.kind === 'waiting') {
    return (
      <div className="p-6 flex flex-col gap-4">
        <div className="flex items-stretch bg-canvas border border-status-info rounded-md overflow-hidden">
          <div className="flex flex-col gap-1.5 px-4 py-3.5 flex-1 min-w-0">
            <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-status-info">
              step 1 · open the oauth tab
            </span>
            <span className="font-mono text-[12px] text-text-primary truncate">
              {state.deviceCodeUrl ?? 'preparing device code...'}
            </span>
          </div>
          {state.deviceCodeUrl ? (
            <a
              href={state.deviceCodeUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 px-6 bg-status-info text-text-ink font-mono text-[11px] font-medium tracking-[0.08em] uppercase hover:opacity-90"
            >
              <span>open</span>
              <span className="font-mono text-[13px]">↗</span>
            </a>
          ) : null}
        </div>
        <div className="flex items-center gap-2.5">
          <Spinner color="status-info" />
          <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-text-secondary">
            waiting for anthropic to issue a code
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="ml-auto font-mono text-[11px] tracking-[0.08em] uppercase text-text-tertiary hover:text-text-primary"
          >
            cancel
          </button>
        </div>
      </div>
    );
  }
  if (state.kind === 'awaiting_code') {
    return (
      <CodeStep
        deviceCodeUrl={state.deviceCodeUrl}
        submitting={state.submitting}
        error={state.error}
        onCancel={onCancel}
        onSubmitCode={onSubmitCode}
      />
    );
  }
  if (state.kind === 'verifying') {
    return (
      <div className="p-8 flex flex-col items-start gap-3.5">
        <div className="flex items-center gap-3.5 bg-canvas border border-border-subtle rounded-md px-5 py-4 w-full">
          <Spinner color="status-info" />
          <div className="flex flex-col gap-1 flex-1">
            <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-status-info">
              testing token with claude api
            </span>
            <span className="font-sans text-[13px] text-text-secondary">
              a quick handshake to confirm the token before saving
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary" />
          <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-text-tertiary">
            token in memory · saved only if test passes
          </span>
        </div>
      </div>
    );
  }
  if (state.kind === 'done') {
    return (
      <div className="p-6 flex flex-col items-start gap-4">
        <div className="flex items-center gap-3.5 bg-canvas border border-status-active rounded-md px-5 py-4 w-full">
          <div className="w-6 h-6 rounded-full border border-status-active flex items-center justify-center font-mono text-[14px] font-medium text-status-active shrink-0">
            ✓
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-status-active">
              claude-code · active
            </span>
            <span className="font-sans text-[13px] text-text-primary">
              Token saved encrypted. Backend ready.
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex items-center justify-center px-7 py-3.5 bg-gold text-text-ink font-mono text-[11px] font-medium tracking-[0.08em] uppercase rounded-md hover:bg-gold-bright"
        >
          done
        </button>
      </div>
    );
  }
  // error
  const isHardError = state.errorKind === 'cli' || state.errorKind === 'unauthorized';
  const ringClass = isHardError ? 'border-status-failed bg-[#1a0d12]' : 'border-gold bg-[#1a1610]';
  const textClass = isHardError ? 'text-status-failed' : 'text-gold';
  const iconClass = isHardError
    ? 'border-status-failed text-status-failed'
    : 'border-gold text-gold';
  return (
    <div className="p-6 flex flex-col items-start gap-4">
      <div className={`flex items-start gap-3.5 border rounded-md px-5 py-4 w-full ${ringClass}`}>
        <div
          className={`w-6 h-6 rounded-full border flex items-center justify-center font-mono text-[14px] font-medium shrink-0 ${iconClass}`}
        >
          !
        </div>
        <div className="flex flex-col gap-1.5 flex-1">
          <span className={`font-mono text-[11px] tracking-[0.08em] uppercase ${textClass}`}>
            {errorKickerLabel(state.errorKind)}
          </span>
          <span className="font-sans text-[13px] text-text-primary leading-snug">
            {state.message}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3.5">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gold text-text-ink font-mono text-[11px] font-medium tracking-[0.08em] uppercase rounded-md hover:bg-gold-bright"
        >
          <span className="font-mono text-[13px]">↻</span>
          <span>{state.errorKind === 'unauthorized' ? 're-authenticate' : 'retry'}</span>
        </button>
        <button
          type="button"
          onClick={onSwitchToPaste}
          className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.08em] uppercase text-text-secondary hover:text-text-primary"
        >
          <span>›</span>
          <span>paste manually instead</span>
        </button>
      </div>
    </div>
  );
}

function errorKickerLabel(kind: 'cli' | 'unauthorized' | 'rate_limited' | 'network'): string {
  switch (kind) {
    case 'cli':
      return 'cli process · exit 1';
    case 'unauthorized':
      return 'anthropic · 401 unauthorized';
    case 'rate_limited':
      return 'anthropic · 429 rate-limited';
    case 'network':
      return 'network · couldn’t reach anthropic';
  }
}

// ─────────────────────────────────────────────────────────────────
// Paste fallback
// ─────────────────────────────────────────────────────────────────

function PasteFlow({
  backend,
  onSwitchToAuto,
  onSuccess,
  saving,
  onSave,
}: {
  backend: BackendListItem;
  onSwitchToAuto: () => void;
  onSuccess: (status: BackendStatus) => void;
  saving: boolean;
  onSave: (token: string) => Promise<{ ok: true; status: BackendStatus }>;
}): JSX.Element {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const field = backend.auth_schema[0];
  const regex = field?.regex ? new RegExp(field.regex) : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (regex && !regex.test(token)) {
      setError(field?.regex_hint ?? 'token format invalid');
      return;
    }
    try {
      const res = await onSave(token);
      onSuccess(res.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to save');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <p className="font-sans text-[14px] text-text-primary">
          Paste a {backend.id} token. We verify it before saving.
        </p>
        <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-text-tertiary">
          mint via: docker compose exec zeno claude setup-token
        </p>
      </div>
      <input
        type="password"
        value={token}
        onChange={(e) => {
          setToken(e.target.value);
          setError(null);
        }}
        placeholder={field?.regex_hint ?? 'sk-ant-oat01-...'}
        className="bg-canvas border border-border-strong rounded-md px-3.5 py-2.5 font-mono text-[12px] text-text-primary placeholder:text-text-tertiary focus:border-gold outline-none"
        autoComplete="off"
      />
      {error ? (
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.08em] uppercase text-status-failed">
          <span className="w-1.5 h-1.5 rounded-full bg-status-failed" />
          <span>{error}</span>
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-border-subtle">
        <button
          type="button"
          onClick={onSwitchToAuto}
          className="font-mono text-[11px] tracking-[0.08em] uppercase text-text-secondary hover:text-text-primary"
        >
          ‹ back to auto-flow
        </button>
        <button
          type="submit"
          disabled={saving || !token}
          className="inline-flex items-center justify-center px-[22px] py-2.5 bg-gold text-text-ink font-mono text-[11px] font-medium tracking-[0.08em] uppercase rounded-md hover:bg-gold-bright disabled:opacity-60"
        >
          {saving ? 'testing...' : 'save & test'}
        </button>
      </div>
    </form>
  );
}

function Spinner({ color }: { color: 'status-info' | 'gold' }): JSX.Element {
  const borderTop = color === 'status-info' ? 'border-t-status-info' : 'border-t-gold';
  return (
    <div
      className={`w-3.5 h-3.5 border-2 border-border-subtle ${borderTop} rounded-full animate-spin shrink-0`}
    />
  );
}

/**
 * Spec 0071 — second step of the auto-OAuth flow. After the operator opens
 * the device-code URL and completes login at claude.ai, Anthropic's callback
 * page displays a `code` parameter. This component lets the operator paste
 * that code back; we POST it to the API which forwards to the CLI's stdin,
 * the CLI exchanges code → token, and the SSE stream picks up the token.
 */
function CodeStep({
  deviceCodeUrl,
  submitting,
  error,
  onCancel,
  onSubmitCode,
}: {
  deviceCodeUrl: string | null;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmitCode: (code: string) => void | Promise<void>;
}): JSX.Element {
  const [code, setCode] = useState('');
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    await onSubmitCode(code.trim());
  };
  return (
    <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-status-info">
          step 2 · paste the code from anthropic
        </span>
        <p className="font-sans text-[13px] text-text-secondary leading-snug">
          After you completed login,{' '}
          {deviceCodeUrl ? (
            <a
              href={deviceCodeUrl}
              target="_blank"
              rel="noreferrer"
              className="underline text-status-info hover:opacity-80"
            >
              the Anthropic page
            </a>
          ) : (
            'the Anthropic page'
          )}{' '}
          shows a code. Paste it below.
        </p>
      </div>
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="paste the code from claude.ai..."
        className="bg-canvas border border-border-strong rounded-md px-3.5 py-2.5 font-mono text-[12px] text-text-primary placeholder:text-text-tertiary focus:border-status-info outline-none"
        autoComplete="off"
      />
      {error ? (
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.08em] uppercase text-status-failed">
          <span className="w-1.5 h-1.5 rounded-full bg-status-failed" />
          <span>{error}</span>
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-border-subtle">
        <button
          type="button"
          onClick={onCancel}
          className="font-mono text-[11px] tracking-[0.08em] uppercase text-text-tertiary hover:text-text-primary"
        >
          cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !code.trim()}
          className="inline-flex items-center justify-center gap-2 px-[22px] py-2.5 bg-gold text-text-ink font-mono text-[11px] font-medium tracking-[0.08em] uppercase rounded-md hover:bg-gold-bright disabled:opacity-60"
        >
          {submitting ? 'sending...' : 'submit code'}
          {!submitting && <span className="font-mono text-[13px]">→</span>}
        </button>
      </div>
    </form>
  );
}
