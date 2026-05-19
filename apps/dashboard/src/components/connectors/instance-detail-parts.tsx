/**
 * Shared building blocks for instance-detail layouts.
 *
 * Spec: .vault/specs/2026-05-08-connectors-cli-first-design (Tasks 20 + 21).
 *
 * Both `connectors.$catalogId.$id.tsx` (artboard A5 — plain instance detail)
 * and `connectors.$catalogId.$appId.instances.$instanceId.tsx` (artboard A6b —
 * App installation detail) render the same status strip + secrets + tools +
 * activity sections. Only the breadcrumb, header copy, and a few section
 * captions differ. We factor those building blocks here so adjustments stay
 * in one place.
 */

import type { JSX, ReactNode } from 'react';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import type { CommandKind } from '@/lib/build-cli-command';
import type {
  ConnectorDetail,
  ConnectorInvocationApi,
  ConnectorToolApi,
  MaskedSecret,
} from '@/lib/use-connectors';

const TOOLS_VISIBLE = 6;

export type VisualStatus = 'active' | 'error' | 'disabled' | 'pending';

export interface Crumb {
  label: string;
  to?: string;
  current?: boolean;
}

export function InstanceDetailShell({
  crumbs,
  children,
}: {
  crumbs: Crumb[];
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="flex min-h-screen bg-canvas">
      <main className="flex-1 flex flex-col overflow-auto">
        <DashboardTopstrip crumbs={crumbs} />
        <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-20 flex flex-col gap-8 min-w-0">
          {children}
        </div>
      </main>
    </div>
  );
}

export function InstanceHeader({
  kicker,
  title,
  description,
  status,
  actions,
}: {
  kicker: string;
  title: string;
  description: ReactNode;
  status: VisualStatus;
  actions: ReactNode;
}): JSX.Element {
  return (
    <header className="flex items-end justify-between gap-6 border-b border-border-subtle pb-6">
      <div className="flex flex-col flex-1 min-w-0">
        <span className="font-mono text-[11px] font-medium tracking-[0.18em] leading-[14px] uppercase text-gold">
          {kicker}
        </span>
        <h1 className="font-sans text-[32px] font-medium tracking-[-0.015em] leading-10 text-text-primary mt-2 m-0 truncate">
          {title}
        </h1>
        <p className="mt-2.5 max-w-[620px] m-0 font-sans text-sm leading-[1.6] text-text-secondary">
          {description}
        </p>
        <div className="mt-3 inline-flex">
          <StatusPill status={status} />
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">{actions}</div>
    </header>
  );
}

export function ActionButton({
  destructive,
  onClick,
  children,
}: {
  destructive?: boolean;
  onClick: () => void;
  children: ReactNode;
}): JSX.Element {
  const cls = destructive
    ? 'border-status-failed/30 text-status-failed hover:bg-status-failed/[0.08]'
    : 'border-border-strong text-text-primary hover:border-gold-line hover:bg-panel';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 border bg-panel-2 font-mono text-[11px] font-medium tracking-[0.12em] leading-3 uppercase transition-colors duration-[120ms] ${cls}`}
    >
      {children}
    </button>
  );
}

export function StatusStrip({
  connector,
  status,
}: {
  connector: ConnectorDetail;
  status: VisualStatus;
}): JSX.Element {
  const lastVerified = connector.lastVerifiedAt
    ? `${formatRelative(connector.lastVerifiedAt)} · ${connector.toolCount} tools`
    : 'never · 0 tools';
  // Spec 2026-05-08 A5: the API doesn't yet split last-verified vs last-test;
  // surface the same timestamp under both labels with a verbal qualifier so the
  // operator sees the full strip the artboard prescribes. Once an explicit
  // `lastTestAt` lands the layout absorbs it without a structural change.
  const lastTest = connector.lastVerifiedAt
    ? `${connector.lastError ? 'failed' : 'passed'} · ${formatRelative(connector.lastVerifiedAt)}`
    : 'never tested';
  const invocations = `${connector.invocationCount24h} · 24h`;

  return (
    <div className="bg-panel border border-border-subtle grid grid-cols-4 divide-x divide-border-subtle">
      <Cell label="status" value={statusLabel(status)} accent={statusAccent(status)} />
      <Cell label="last verified" value={lastVerified} />
      <Cell label="last test" value={lastTest} />
      <Cell label="invocations 24h" value={invocations} />
    </div>
  );
}

function Cell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}): JSX.Element {
  return (
    <div className="px-4 py-3 flex flex-col gap-1.5">
      <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
        {label}
      </span>
      <span className={`font-mono text-[13px] leading-4 ${accent ?? 'text-text-primary'} truncate`}>
        {value}
      </span>
    </div>
  );
}

export function SecretsSection({
  connector,
  onCommand,
  summaryOverride,
}: {
  connector: ConnectorDetail;
  onCommand: (cmd: CommandKind) => void;
  /**
   * Override the right-side caption (e.g. App-installation pages show
   * "1 secret · inherits PEM from App" instead of the default summary).
   */
  summaryOverride?: string;
}): JSX.Element {
  const total = connector.secrets.length;
  const summary =
    summaryOverride ??
    (total === 0 ? 'no secrets' : `${total} ${total === 1 ? 'secret' : 'secrets'} · encrypted`);
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
        <h2 className="m-0 font-sans text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
          secrets
        </h2>
        <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
          {summary}
        </span>
      </div>
      {total === 0 ? (
        <div className="bg-panel border border-border-subtle px-6 py-8 flex flex-col items-center gap-1 text-center">
          <span className="font-sans text-[13px] leading-[1.6] text-text-secondary">
            No secrets configured for this instance.
          </span>
        </div>
      ) : (
        <div className="bg-panel border border-border-subtle flex flex-col">
          <div className="flex items-center gap-3.5 px-[18px] py-2.5 bg-sidebar border-b border-border-subtle">
            <span className="flex-1 min-w-0 font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
              key
            </span>
            <span className="w-[200px] shrink-0 font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
              value
            </span>
            <span className="w-[110px] shrink-0 text-right font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
              action
            </span>
          </div>
          {connector.secrets.map((secret, i) => (
            <SecretRow
              key={secret.key}
              connector={connector}
              secret={secret}
              last={i === total - 1}
              onCommand={onCommand}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SecretRow({
  connector,
  secret,
  last,
  onCommand,
}: {
  connector: ConnectorDetail;
  secret: MaskedSecret;
  last: boolean;
  onCommand: (cmd: CommandKind) => void;
}): JSX.Element {
  return (
    <div
      className={`flex items-center gap-3.5 px-[18px] py-3 ${
        last ? '' : 'border-b border-border-subtle'
      }`}
    >
      <span className="flex-1 min-w-0 font-mono text-[12px] font-medium tracking-[0.02em] leading-4 text-text-primary truncate">
        {secret.key}
      </span>
      <span className="w-[200px] shrink-0 font-mono text-[12px] leading-4 text-text-secondary">
        {`••••••••••••${secret.last4}`}
      </span>
      <span className="w-[110px] shrink-0 inline-flex justify-end gap-2">
        <button
          type="button"
          onClick={() =>
            onCommand({ kind: 'reveal-secret', slug: connector.slug, key: secret.key })
          }
          className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-border-strong bg-panel-2 font-mono text-[10px] tracking-[0.1em] leading-3 uppercase text-text-primary transition-colors duration-[120ms] hover:border-gold-line hover:text-gold"
        >
          ◉ reveal
        </button>
        <button
          type="button"
          onClick={() => onCommand({ kind: 'set-secret', slug: connector.slug, key: secret.key })}
          aria-label={`Edit secret ${secret.key}`}
          className="w-7 h-7 inline-flex items-center justify-center font-mono text-xs text-text-tertiary hover:text-text-primary"
        >
          ⋯
        </button>
      </span>
    </div>
  );
}

export function ToolsSection({
  connector,
  onCommand,
}: {
  connector: ConnectorDetail;
  onCommand: (cmd: CommandKind) => void;
}): JSX.Element {
  const tools = connector.tools;
  const total = tools.length;
  const visible = tools.slice(0, TOOLS_VISIBLE);
  const remaining = total - visible.length;
  const counts = tools.reduce(
    (acc, t) => {
      acc[t.category] += 1;
      return acc;
    },
    { read: 0, write: 0, interactive: 0 } as Record<ConnectorToolApi['category'], number>,
  );
  const summary = `${counts.read} read · ${counts.write} write · ${counts.interactive} interactive`;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
        <h2 className="m-0 font-sans text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
          tools
        </h2>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
            {total === 0 ? 'no tools' : summary}
          </span>
          {total > 0 && (
            <button
              type="button"
              onClick={() =>
                onCommand({
                  kind: 'tool-bulk',
                  slug: connector.slug,
                  category: 'read',
                  permission: 'always_allow',
                })
              }
              className="inline-flex items-center px-2.5 py-1 border border-border-strong bg-panel-2 font-mono text-[10px] tracking-[0.1em] leading-3 uppercase text-text-primary transition-colors duration-[120ms] hover:border-gold-line hover:text-gold"
            >
              bulk edit
            </button>
          )}
        </div>
      </div>
      {total === 0 ? (
        <div className="bg-panel border border-border-subtle px-6 py-8 flex flex-col items-center gap-1 text-center">
          <span className="font-sans text-[13px] leading-[1.6] text-text-secondary">
            No tools discovered yet. Run{' '}
            <span className="font-mono text-gold">zeno connector test {connector.slug}</span> to
            populate this list.
          </span>
        </div>
      ) : (
        <div className="bg-panel border border-border-subtle flex flex-col">
          <div className="flex items-center gap-3.5 px-[18px] py-2.5 bg-sidebar border-b border-border-subtle">
            <span className="flex-1 min-w-0 font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
              tool
            </span>
            <span className="w-[110px] shrink-0 font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
              category
            </span>
            <span className="w-[140px] shrink-0 font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
              permission
            </span>
            <span className="w-[44px] shrink-0 text-right font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
              edit
            </span>
          </div>
          {visible.map((tool, i) => (
            <ToolRow
              key={tool.toolName}
              connector={connector}
              tool={tool}
              last={i === visible.length - 1 && remaining === 0}
              onCommand={onCommand}
            />
          ))}
          {remaining > 0 && (
            <div className="px-[18px] py-2.5 text-center font-mono text-[11px] tracking-[0.04em] leading-[14px] text-text-tertiary">
              + {remaining} more · view all in CLI
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ToolRow({
  connector,
  tool,
  last,
  onCommand,
}: {
  connector: ConnectorDetail;
  tool: ConnectorToolApi;
  last: boolean;
  onCommand: (cmd: CommandKind) => void;
}): JSX.Element {
  const permissionAccent = (() => {
    if (tool.permission === 'never') return 'text-status-failed';
    return 'text-gold';
  })();
  return (
    <div
      className={`flex items-center gap-3.5 px-[18px] py-2.5 ${
        last ? '' : 'border-b border-border-subtle'
      }`}
    >
      <span className="flex-1 min-w-0 font-mono text-xs font-medium tracking-[0.02em] leading-4 text-text-primary truncate">
        {tool.toolName}
      </span>
      <span className="w-[110px] shrink-0 font-mono text-[11px] leading-[14px] text-text-secondary">
        {tool.category}
      </span>
      <span
        className={`w-[140px] shrink-0 font-mono text-[10px] tracking-[0.12em] leading-3 uppercase ${permissionAccent}`}
      >
        {tool.permission.replace('_', ' ')}
      </span>
      <span className="w-[44px] shrink-0 inline-flex justify-end">
        <button
          type="button"
          aria-label={`Edit permission for ${tool.toolName}`}
          onClick={() =>
            onCommand({
              kind: 'tool-set',
              slug: connector.slug,
              tool: tool.toolName,
              permission: tool.permission,
            })
          }
          className="w-7 h-7 inline-flex items-center justify-center font-mono text-xs text-text-tertiary hover:text-text-primary"
        >
          ⋯
        </button>
      </span>
    </div>
  );
}

export function ActivitySection({
  feed,
  loading,
}: {
  feed: ConnectorInvocationApi[];
  loading: boolean;
}): JSX.Element {
  const total = feed.length;
  const okCount = feed.filter((e) => e.result === 'ok').length;
  const summary = (() => {
    if (loading) return 'loading…';
    if (total === 0) return 'no invocations yet';
    return `last 24h · ${total} ${total === 1 ? 'invocation' : 'invocations'} · ${okCount} ok`;
  })();
  const visible = feed.slice(0, 5);
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
        <h2 className="m-0 font-sans text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
          activity
        </h2>
        <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
          {summary}
        </span>
      </div>
      {total === 0 ? (
        <div className="bg-panel border border-border-subtle px-6 py-8 flex flex-col items-center gap-1 text-center">
          <span className="font-sans text-[13px] leading-[1.6] text-text-secondary">
            Once tools start firing, you'll see invocations here with timing and tool names.
          </span>
        </div>
      ) : (
        <div className="bg-panel border border-border-subtle flex flex-col">
          {visible.map((entry, i) => (
            <ActivityRow key={entry.id} entry={entry} last={i === visible.length - 1} />
          ))}
        </div>
      )}
    </section>
  );
}

function ActivityRow({
  entry,
  last,
}: {
  entry: ConnectorInvocationApi;
  last: boolean;
}): JSX.Element {
  const ok = entry.result === 'ok';
  return (
    <div
      className={`flex items-center gap-3.5 px-[18px] py-2.5 ${
        last ? '' : 'border-b border-border-subtle'
      }`}
    >
      <span
        title={entry.createdAt}
        className="shrink-0 w-[78px] font-mono text-[11px] tracking-[0.04em] leading-[14px] text-text-tertiary"
      >
        {formatRelative(entry.createdAt)}
      </span>
      <span className="flex-1 min-w-0 font-mono text-xs font-medium tracking-[0.02em] leading-4 text-text-primary truncate">
        {entry.toolName}
        {!ok && entry.errorMessage && (
          <span className="text-status-failed ml-2 font-normal">{entry.errorMessage}</span>
        )}
      </span>
      <span
        className={`shrink-0 inline-flex items-center justify-center font-mono text-[10px] tracking-[0.1em] leading-3 uppercase ${
          ok ? 'text-status-active' : 'text-status-failed'
        }`}
      >
        {ok ? 'ok' : 'err'}
      </span>
      <span className="shrink-0 w-[68px] text-right font-mono text-[11px] tracking-[0.04em] leading-[14px] text-text-tertiary">
        {entry.durationMs}ms
      </span>
    </div>
  );
}

function StatusPill({ status }: { status: VisualStatus }): JSX.Element {
  const config = {
    active: {
      cls: 'bg-status-active/[0.06] border border-status-active/30 text-status-active',
      dot: 'bg-status-active',
      label: 'active',
    },
    error: {
      cls: 'bg-status-failed/[0.06] border border-status-failed/30 text-status-failed',
      dot: 'bg-status-failed',
      label: 'error',
    },
    disabled: {
      cls: 'bg-panel-2 border border-border-subtle text-text-tertiary',
      dot: 'bg-text-tertiary',
      label: 'disabled',
    },
    pending: {
      cls: 'bg-gold/10 border border-gold-line text-gold',
      dot: 'bg-gold',
      label: 'pending',
    },
  }[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-[3px] font-mono text-[10px] tracking-[0.1em] leading-3 uppercase ${config.cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

export function visualStatus(c: ConnectorDetail): VisualStatus {
  if (c.status === 'enabled') return c.lastError ? 'error' : 'active';
  if (c.status === 'disabled') return 'disabled';
  return 'pending';
}

function statusLabel(status: VisualStatus): string {
  if (status === 'active') return '● active';
  if (status === 'error') return '✗ error';
  if (status === 'disabled') return '○ disabled';
  return '◐ pending';
}

function statusAccent(status: VisualStatus): string {
  if (status === 'active') return 'text-status-active';
  if (status === 'error') return 'text-status-failed';
  if (status === 'pending') return 'text-gold';
  return 'text-text-tertiary';
}

export function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
