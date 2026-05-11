/**
 * Spec 0072 — first-run onboarding hero. Lives outside `_authed` so it can
 * render without the sidebar/topstrip — operator lands here when the
 * dashboard root sees no configured backend (see `_authed/index.tsx`).
 *
 * CLI-first: dashboard never mutates backend credentials. The hero shows
 * the exact `zeno backend configure` command + COPY + DOCS↗, polls
 * /api/backends every 2s, and auto-redirects to /backend the moment any
 * backend reports `status === 'active'`.
 *
 * Visual contract: Paper artboard `1AWS-0` (B4).
 */

import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { Crest } from '@zeno/ui';
import { type JSX, useEffect, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api-client';
import { type BackendsResponse, useBackends } from '@/lib/use-backends';

const CONFIGURE_CMD = 'zeno backend configure';
const DOCS_URL = 'https://docs.zeno-agent.dev/cli#zeno-backend-configure';

export const Route = createFileRoute('/onboarding/connect-backend')({
  beforeLoad: async () => {
    // Reverse-redirect — if any backend is already configured, send to
    // /backend so the operator doesn't see this hero again.
    try {
      const r = await apiFetch<BackendsResponse>('/api/backends');
      const configured = r.backends.some((b) => b.status !== 'not_configured');
      if (configured) {
        throw redirect({ to: '/backend' });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        // ignore — fall through to render
      } else if ((err as { isRedirect?: boolean })?.isRedirect) {
        throw err;
      }
    }
  },
  component: OnboardingConnectBackend,
});

function OnboardingConnectBackend(): JSX.Element {
  const navigate = useNavigate();
  // Spec 0072 — fast 2s polling while operator runs the CLI in another
  // terminal. The instant any backend reports active, redirect to /backend.
  const q = useBackends({ poll: 'fast' });
  useEffect(() => {
    const active = q.data?.backends.some((b) => b.status === 'active');
    if (active) {
      void navigate({ to: '/backend' });
    }
  }, [q.data, navigate]);

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
      </div>

      {/* Hero column */}
      <div className="pt-[180px] pl-[120px] flex flex-col gap-10 max-w-[640px]">
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
          <p className="font-sans text-[17px] leading-[1.5] text-text-secondary max-w-[540px] m-0">
            One step left: connect a backend. Run the command below in your terminal — Zeno detects
            the new credentials within seconds and unlocks the dashboard.
          </p>
        </div>

        <CommandBlock />

        <div className="flex flex-col gap-3 font-mono text-[11px] tracking-[0.08em] uppercase text-text-tertiary">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gold" />
            <span>
              picker shows every backend in the catalog · today: claude-code · future: codex ·
              gemini
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-status-info animate-pulse" />
            <span>waiting for cli run · polls every 2s</span>
          </div>
        </div>
      </div>

      {/* Footer meta bottom-left */}
      <div className="absolute bottom-8 left-8 flex items-center gap-3 font-mono text-[11px] tracking-[0.08em] text-text-tertiary uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary" />
        profile · default · localhost:3000
      </div>
    </div>
  );
}

const COPIED_RESET_MS = 1500;

function CommandBlock(): JSX.Element {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => window.clearTimeout(t);
  }, [copied]);
  const handleCopy = (): void => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(CONFIGURE_CMD);
    }
    setCopied(true);
  };
  return (
    <div className="flex flex-col rounded-md border border-border-strong overflow-hidden max-w-[640px]">
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5 bg-panel">
        <span className="font-mono text-[11px] font-medium tracking-[0.08em] uppercase text-gold">
          configure backend
        </span>
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[10px] font-medium tracking-[0.08em] uppercase text-text-secondary hover:text-text-primary"
        >
          docs ↗
        </a>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? 'copied' : 'copy command'}
        className="group/copy flex w-full items-center justify-between gap-3 bg-canvas px-[18px] py-3.5 text-left transition-colors duration-[120ms] hover:bg-panel-2"
      >
        <pre className="m-0 flex-1 whitespace-pre font-mono text-[14px] leading-[1.4] text-text-primary">
          {`$ ${CONFIGURE_CMD}`}
        </pre>
        <span
          aria-hidden
          className={`shrink-0 font-mono text-[10px] font-medium tracking-[0.08em] uppercase transition-colors duration-[120ms] ${
            copied ? 'text-status-active' : 'text-text-tertiary group-hover/copy:text-gold'
          }`}
        >
          {copied ? 'copied' : 'copy'}
        </span>
      </button>
    </div>
  );
}
