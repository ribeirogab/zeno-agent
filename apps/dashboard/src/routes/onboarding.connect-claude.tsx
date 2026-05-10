import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { Crest } from '@zeno/ui';
import { type FormEvent, type JSX, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api-client';
import {
  type BackendListItem,
  type BackendsResponse,
  useBackends,
  useSaveBackendCredentials,
  useStartOAuth,
} from '@/lib/use-backends';
import { useOAuthSession } from '@/lib/use-oauth-session';

/**
 * Spec 0071: first-run onboarding hero. Lives outside `_authed` so it can
 * render without the sidebar/topstrip — the operator is dropped here when
 * the dashboard root sees no configured backend (see `_authed/index.tsx`).
 *
 * State machine matches the Configure modal but full-page.
 *   idle → click Connect Claude → POST /oauth/start → waiting → verifying → done
 *   idle → click "paste manually" → paste form → verifying → done
 *
 * Reverse-redirect: if a backend is already configured (status !==
 * 'not_configured'), bounce to /settings/backend so the operator doesn't
 * see this hero again.
 */
export const Route = createFileRoute('/onboarding/connect-claude')({
  beforeLoad: async () => {
    // Reverse-redirect — if any backend is configured, send to settings tab.
    try {
      const r = await apiFetch<BackendsResponse>('/api/backends');
      const configured = r.backends.some((b) => b.status !== 'not_configured');
      if (configured) {
        throw redirect({ to: '/backend' });
      }
    } catch (err) {
      // If the API itself fails, render the hero anyway — operator has no
      // other way to recover from a misconfigured api in onboarding.
      if (err instanceof ApiError) {
        // ignore — fall through to render
      } else if ((err as { isRedirect?: boolean })?.isRedirect) {
        throw err;
      }
    }
  },
  component: OnboardingConnectClaude,
});

function OnboardingConnectClaude(): JSX.Element {
  const q = useBackends();
  const claude = q.data?.backends.find((b) => b.id === 'claude-code');

  return (
    <div className="min-h-screen bg-canvas relative">
      {/* Brand mark top-left */}
      <div className="absolute top-8 left-8 flex items-center gap-2.5">
        <span className="text-gold">
          <Crest size={22} />
        </span>
        <span className="font-mono text-[14px] font-medium text-text-primary tracking-[0.02em]">
          zeno
        </span>
        <span className="font-mono text-[11px] tracking-[0.08em] text-text-tertiary ml-2">
          v0.3.1
        </span>
      </div>

      {/* Hero column, anchored left, vertically centered-ish */}
      <div className="pt-[200px] pl-[120px] flex flex-col gap-12 max-w-[640px]">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gold" />
            <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-gold">
              first run · setup
            </span>
          </div>
          <h1
            className="font-serif text-[56px] italic font-medium leading-[1.05] tracking-[-0.02em] text-text-primary m-0"
            style={{ fontStyle: 'italic' }}
          >
            Welcome to Zeno.
          </h1>
          <p className="font-sans text-[18px] leading-6 text-text-secondary max-w-[520px] m-0">
            One step left: connect Claude. We&apos;ll open Anthropic&apos;s OAuth in a new tab — no
            terminal needed.
          </p>
        </div>

        {claude ? <FlowBody backend={claude} /> : <FlowBodyLoading />}
      </div>

      {/* Footer meta bottom-left */}
      <div className="absolute bottom-8 left-8 flex items-center gap-3 font-mono text-[11px] tracking-[0.08em] text-text-tertiary uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary" />
        profile · default · localhost:3000
      </div>
    </div>
  );
}

function FlowBodyLoading(): JSX.Element {
  return <div className="bg-panel border border-border-subtle rounded-md p-8 h-32 animate-pulse" />;
}

function FlowBody({ backend }: { backend: BackendListItem }): JSX.Element {
  const navigate = useNavigate();
  const oauth = useOAuthSession();
  const startOAuth = useStartOAuth();
  const save = useSaveBackendCredentials();
  const [view, setView] = useState<'auto' | 'paste'>('auto');

  const handleConnect = async () => {
    const { session_id } = await startOAuth.mutateAsync(backend.id);
    oauth.start({ backendId: backend.id, sessionId: session_id });
  };

  if (view === 'paste') {
    return (
      <PasteFlow
        backend={backend}
        onSwitchToAuto={() => setView('auto')}
        onSuccess={() => navigate({ to: '/' })}
        saving={save.isPending}
        onSave={(token) => save.mutateAsync({ backendId: backend.id, token })}
      />
    );
  }

  const state = oauth.state;
  if (state.kind === 'idle') {
    return (
      <div className="flex flex-col gap-5">
        <button
          type="button"
          onClick={handleConnect}
          disabled={startOAuth.isPending}
          className="inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-gold text-text-ink font-mono text-[12px] font-medium tracking-[0.08em] uppercase rounded-md hover:bg-gold-bright disabled:opacity-60 w-fit"
        >
          <span className="font-mono text-[14px]">→</span>
          <span>{startOAuth.isPending ? 'starting...' : 'connect claude'}</span>
        </button>
        <div className="flex items-center gap-2.5 font-mono text-[11px] tracking-[0.08em] uppercase text-text-tertiary">
          <span className="w-1.5 h-1.5 rounded-full bg-gold" />
          opens claude.ai oauth · token stored encrypted (aes-256-gcm)
        </div>
        <button
          type="button"
          onClick={() => setView('paste')}
          className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.08em] uppercase text-text-secondary hover:text-text-primary w-fit"
        >
          <span className="font-mono text-[10px]">›</span>
          <span>paste a token manually instead</span>
        </button>
      </div>
    );
  }
  if (state.kind === 'waiting') {
    return (
      <div className="flex flex-col gap-4 max-w-[640px]">
        <div className="flex items-stretch bg-panel border border-status-info rounded-md overflow-hidden">
          <div className="flex flex-col gap-1.5 px-5 py-4 flex-1 min-w-0">
            <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-status-info">
              device code
            </span>
            <span className="font-mono text-[13px] text-text-primary truncate">
              {state.deviceCodeUrl ?? 'waiting for device code...'}
            </span>
          </div>
          {state.deviceCodeUrl ? (
            <a
              href={state.deviceCodeUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 px-7 bg-status-info text-text-ink font-mono text-[11px] font-medium tracking-[0.08em] uppercase hover:opacity-90"
            >
              <span>open</span>
              <span className="font-mono text-[14px]">↗</span>
            </a>
          ) : null}
        </div>
        <div className="flex items-center gap-2.5">
          <Spinner color="status-info" />
          <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-text-secondary">
            listening for token from anthropic
          </span>
          <button
            type="button"
            onClick={() => oauth.cancel(backend.id)}
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
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const code = String(fd.get('code') ?? '').trim();
          if (!code) return;
          await oauth.submitCode(backend.id, code);
        }}
        className="flex flex-col gap-4 max-w-[640px]"
      >
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-status-info">
            step 2 · paste the code from anthropic
          </span>
          <p className="font-sans text-[15px] text-text-primary leading-snug max-w-[520px]">
            After login, the Anthropic page shows a code. Paste it below — we forward it to the CLI,
            exchange for a token, and save it encrypted.
          </p>
        </div>
        <input
          type="text"
          name="code"
          autoComplete="off"
          placeholder="paste the code from claude.ai..."
          className="bg-panel border border-border-strong rounded-md px-4 py-3 font-mono text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-status-info outline-none w-full"
        />
        {state.error ? (
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.08em] uppercase text-status-failed">
            <span className="w-1.5 h-1.5 rounded-full bg-status-failed" />
            <span>{state.error}</span>
          </div>
        ) : null}
        <div className="flex items-center gap-3.5">
          <button
            type="submit"
            disabled={state.submitting}
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-gold text-text-ink font-mono text-[12px] font-medium tracking-[0.08em] uppercase rounded-md hover:bg-gold-bright disabled:opacity-60"
          >
            {state.submitting ? 'sending...' : 'submit code'}
            {!state.submitting && <span className="font-mono text-[14px]">→</span>}
          </button>
          <button
            type="button"
            onClick={() => oauth.cancel(backend.id)}
            className="font-mono text-[11px] tracking-[0.08em] uppercase text-text-tertiary hover:text-text-primary"
          >
            cancel
          </button>
        </div>
      </form>
    );
  }
  if (state.kind === 'verifying') {
    return (
      <div className="flex flex-col gap-3.5 max-w-[640px]">
        <div className="flex items-center gap-3.5 bg-panel border border-border-subtle rounded-md px-5 py-4">
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
      <div className="flex flex-col gap-5 max-w-[640px]">
        <div className="flex items-center gap-3.5 bg-panel border border-status-active rounded-md px-5 py-4">
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
          onClick={() => navigate({ to: '/' })}
          className="inline-flex items-center justify-center gap-2.5 px-8 py-4 bg-gold text-text-ink font-mono text-[12px] font-medium tracking-[0.08em] uppercase rounded-md hover:bg-gold-bright w-fit"
        >
          <span>open dashboard</span>
          <span className="font-mono text-[14px]">→</span>
        </button>
      </div>
    );
  }
  // error
  const isHardError = state.errorKind === 'cli' || state.errorKind === 'unauthorized';
  const ringClass = isHardError ? 'border-status-failed bg-[#1a0d12]' : 'border-gold bg-[#1a1610]';
  const textClass = isHardError ? 'text-status-failed' : 'text-gold';
  return (
    <div className="flex flex-col gap-4 max-w-[640px]">
      <div className={`flex items-start gap-3.5 border rounded-md px-5 py-4 ${ringClass}`}>
        <div
          className={`w-6 h-6 rounded-full border ${textClass.replace('text-', 'border-')} flex items-center justify-center font-mono text-[14px] font-medium ${textClass} shrink-0`}
        >
          !
        </div>
        <div className="flex flex-col gap-1.5 flex-1">
          <span className={`font-mono text-[11px] tracking-[0.08em] uppercase ${textClass}`}>
            {state.errorKind === 'cli'
              ? 'cli process · exit 1'
              : state.errorKind === 'unauthorized'
                ? 'anthropic · 401 unauthorized'
                : state.errorKind === 'rate_limited'
                  ? 'anthropic · 429 rate-limited'
                  : 'network · couldn’t reach anthropic'}
          </span>
          <span className="font-sans text-[13px] text-text-primary leading-snug">
            {state.message}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3.5">
        <button
          type="button"
          onClick={() => oauth.reset()}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gold text-text-ink font-mono text-[11px] font-medium tracking-[0.08em] uppercase rounded-md hover:bg-gold-bright"
        >
          <span className="font-mono text-[13px]">↻</span>
          <span>retry</span>
        </button>
        <button
          type="button"
          onClick={() => {
            oauth.cancel(backend.id);
            setView('paste');
          }}
          className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.08em] uppercase text-text-secondary hover:text-text-primary"
        >
          <span>›</span>
          <span>paste manually instead</span>
        </button>
      </div>
    </div>
  );
}

function PasteFlow({
  backend,
  onSwitchToAuto,
  onSuccess,
  saving,
  onSave,
}: {
  backend: BackendListItem;
  onSwitchToAuto: () => void;
  onSuccess: () => void;
  saving: boolean;
  onSave: (token: string) => Promise<unknown>;
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
      await onSave(token);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to save');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-w-[640px]">
      <p className="font-mono text-[11px] tracking-[0.08em] uppercase text-text-tertiary">
        mint via: docker compose exec zeno claude setup-token
      </p>
      <input
        type="password"
        value={token}
        onChange={(e) => {
          setToken(e.target.value);
          setError(null);
        }}
        placeholder={field?.regex_hint ?? 'sk-ant-oat01-...'}
        className="bg-canvas border border-border-strong rounded-md px-4 py-3 font-mono text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-gold outline-none w-full"
        autoComplete="off"
      />
      {error ? (
        <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.08em] uppercase text-status-failed">
          <span className="w-1.5 h-1.5 rounded-full bg-status-failed" />
          <span>{error}</span>
        </div>
      ) : null}
      <div className="flex items-center gap-3.5">
        <button
          type="submit"
          disabled={saving || !token}
          className="inline-flex items-center justify-center px-7 py-3.5 bg-gold text-text-ink font-mono text-[11px] font-medium tracking-[0.08em] uppercase rounded-md hover:bg-gold-bright disabled:opacity-60"
        >
          {saving ? 'testing...' : 'save & test'}
        </button>
        <button
          type="button"
          onClick={onSwitchToAuto}
          className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.08em] uppercase text-text-secondary hover:text-text-primary"
        >
          <span>‹</span>
          <span>back to auto-flow</span>
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
