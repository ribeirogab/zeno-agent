import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useToast } from '@zeno/ui';
import type { JSX } from 'react';
import { useState } from 'react';
import { InheritedAppCallout } from '@/components/connectors/inherited-app-callout';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { ConfirmModal } from '@/components/shared/confirm-modal';
import {
  useRefreshTools,
  useRevealSecret,
  useSetBulkPermission,
  useSetToolPermission,
  useTestInstalledConnector,
  useToggleConnector,
  useUninstallConnector,
} from '@/lib/connector-mutations';
import {
  type ConnectorDetail,
  type ConnectorInvocationApi,
  type ToolCategory,
  type ToolPermission,
  useConnector,
  useConnectorActivity,
} from '@/lib/use-connectors';

export const Route = createFileRoute('/_authed/connectors/$id')({
  component: ConnectorDetailScreen,
});

function ConnectorDetailScreen(): JSX.Element {
  const { id } = Route.useParams();
  const connector = useConnector(id);
  const activity = useConnectorActivity(id);
  const navigate = useNavigate();
  const toast = useToast();
  const toggle = useToggleConnector();
  const test = useTestInstalledConnector();
  const refresh = useRefreshTools();
  const uninstall = useUninstallConnector();
  const [confirmKind, setConfirmKind] = useState<'refresh' | 'uninstall' | null>(null);

  if (connector.error) {
    return (
      <Main breadcrumbLabel="error">
        <div className="bg-status-failed/[0.06] border border-status-failed/30 text-status-failed px-4 py-3 font-mono text-[11px]">
          failed to load connector — it may have been uninstalled
        </div>
      </Main>
    );
  }
  if (!connector.data) {
    return (
      <Main breadcrumbLabel="…">
        <p className="font-mono text-[11px] text-text-tertiary">loading…</p>
      </Main>
    );
  }

  const c = connector.data;
  const enabled = c.status === 'enabled';
  const visualStatus = c.status === 'enabled' ? (c.lastError ? 'error' : 'active') : c.status;

  const handleToggle = (): void => {
    if (c.status === 'pending') {
      toast.warn('teste a conexão antes de ativar');
      return;
    }
    toggle.mutate({
      id: c.id,
      current: c.status === 'enabled' ? 'enabled' : 'disabled',
    });
  };

  const handleTest = (): void => {
    test.mutate(
      { id: c.id },
      {
        onSuccess: (result) => {
          if (result.ok) {
            toast.success(
              `${c.displayName} · ${result.tools.length} tools · ${result.durationMs}ms`,
            );
          } else {
            toast.fail(`${c.displayName} · ${result.error}`);
          }
        },
      },
    );
  };

  const handleRefresh = (): void => {
    setConfirmKind('refresh');
  };

  const handleUninstall = (): void => {
    setConfirmKind('uninstall');
  };

  const confirmRefresh = (): void => {
    setConfirmKind(null);
    refresh.mutate({ id: c.id });
  };

  const confirmUninstall = (): void => {
    setConfirmKind(null);
    uninstall.mutate(
      { id: c.id },
      {
        onSuccess: () => {
          // Spec 0051 finding #2: github-app installations live under
          // `/connectors/github-app`, not `/connectors`. Route by appId
          // (not slug prefix) so a custom connector named "github-app-foo"
          // doesn't trigger the wrong destination.
          navigate({ to: c.appId ? '/connectors/github-app' : '/connectors' });
        },
      },
    );
  };

  return (
    <Main breadcrumbLabel={c.displayName}>
      <Header
        connector={c}
        visualStatus={visualStatus}
        enabled={enabled}
        onToggle={handleToggle}
        onTest={handleTest}
        onRefresh={handleRefresh}
        onUninstall={handleUninstall}
      />
      {visualStatus === 'error' && c.lastError && (
        <ErrorBanner message={c.lastError} onTest={handleTest} />
      )}
      {/* Spec 0045 C10: github-app-* installations share credentials with the
          parent App row; surface this with a gold callout. Use the appId FK
          (not slug prefix) so a custom connector named "github-app-foo"
          doesn't trigger a false positive. R3 F1. */}
      {c.appId && <InheritedAppCallout />}
      <ConnectionSection connector={c} />
      <ToolPermissionsSection connector={c} />
      <ActivitySection feed={activity.data ?? []} loading={activity.isLoading} />
      {confirmKind === 'refresh' && (
        <ConfirmModal
          title="Refresh tools?"
          description="This will reset tool permissions to defaults."
          confirmLabel="refresh tools"
          onConfirm={confirmRefresh}
          onClose={() => setConfirmKind(null)}
        />
      )}
      {confirmKind === 'uninstall' && (
        <ConfirmModal
          title={`Uninstall ${c.displayName}?`}
          description="This removes all secrets and tools associated with this connector."
          confirmLabel="uninstall"
          intent="destructive"
          requireTypeToConfirm={c.displayName}
          onConfirm={confirmUninstall}
          onClose={() => setConfirmKind(null)}
        />
      )}
    </Main>
  );
}

function Main({
  breadcrumbLabel,
  children,
}: {
  breadcrumbLabel: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex min-h-screen bg-canvas">
      <main className="flex-1 flex flex-col overflow-auto">
        <DashboardTopstrip
          crumbs={[
            { label: 'connectors', to: '/connectors' },
            { label: breadcrumbLabel, current: true },
          ]}
        />
        <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-20 flex flex-col gap-8 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              to="/connectors"
              className="font-mono text-[11px] tracking-[0.06em] leading-[14px] uppercase text-text-tertiary hover:text-text-secondary"
            >
              connectors
            </Link>
            <span className="font-mono text-[11px] tracking-[0.06em] leading-[14px] text-text-tertiary">
              /
            </span>
            <span className="font-mono text-[11px] tracking-[0.06em] leading-[14px] uppercase text-gold">
              {breadcrumbLabel}
            </span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

function Header({
  connector,
  visualStatus,
  enabled,
  onToggle,
  onTest,
  onRefresh,
  onUninstall,
}: {
  connector: ConnectorDetail;
  visualStatus: string;
  enabled: boolean;
  onToggle: () => void;
  onTest: () => void;
  onRefresh: () => void;
  onUninstall: () => void;
}): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="flex items-start justify-between gap-6 border-b border-border-subtle pb-6">
      <div className="flex items-start gap-4 flex-1 min-w-0">
        <span
          className={`shrink-0 w-12 h-12 inline-flex items-center justify-center border border-gold-line ${
            connector.iconUrl ? 'bg-text-primary' : 'bg-panel-2 text-gold'
          } ${enabled ? '' : 'opacity-60'}`}
        >
          {connector.iconUrl ? (
            <img src={connector.iconUrl} alt={connector.displayName} width={24} height={24} />
          ) : (
            <span className="font-mono text-xl font-semibold leading-6">
              {connector.displayName.slice(0, 1).toUpperCase()}
            </span>
          )}
        </span>
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <h1 className="m-0 font-mono text-2xl font-medium tracking-[0.02em] leading-[30px] text-text-primary">
            {connector.displayName}
          </h1>
          <div className="flex items-center flex-wrap gap-3">
            <Pill outline>{connector.transport}</Pill>
            <StatusPill status={visualStatus as 'active' | 'error' | 'disabled' | 'pending'} />
            <span className="font-sans text-[13px] leading-4 text-text-secondary">
              {connector.toolCount} tools · {connector.source}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2.5 shrink-0 relative">
        <button type="button" onClick={onToggle} className="flex items-center gap-2">
          <span className="font-mono text-[11px] tracking-[0.08em] leading-[14px] uppercase text-text-secondary">
            {enabled ? 'enabled' : connector.status === 'pending' ? 'pending' : 'disabled'}
          </span>
          <Toggle on={enabled} />
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          title="More actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="w-8 h-8 inline-flex items-center justify-center border border-border-subtle font-mono text-sm text-text-secondary hover:text-text-primary"
        >
          ⋯
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+6px)] z-30 w-[200px] bg-panel border border-border-subtle shadow-[0_12px_24px_-8px_rgba(0,0,0,0.7)] flex flex-col"
          >
            <MenuItem
              onClick={() => {
                setMenuOpen(false);
                onTest();
              }}
            >
              test connection
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMenuOpen(false);
                onRefresh();
              }}
            >
              refresh tools
            </MenuItem>
            <span className="h-px bg-border-subtle mx-1.5" />
            <MenuItem
              destructive
              onClick={() => {
                setMenuOpen(false);
                onUninstall();
              }}
            >
              uninstall
            </MenuItem>
          </div>
        )}
      </div>
    </header>
  );
}

function MenuItem({
  destructive,
  onClick,
  children,
}: {
  destructive?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`text-left px-3.5 py-2.5 font-mono text-[11px] tracking-[0.08em] leading-3 uppercase ${
        destructive
          ? 'text-text-secondary hover:bg-status-failed/[0.08] hover:text-status-failed'
          : 'text-text-secondary hover:bg-gold-soft hover:text-gold'
      }`}
    >
      {children}
    </button>
  );
}

function Toggle({ on }: { on: boolean }): JSX.Element {
  return (
    <span
      className={`relative inline-block w-9 h-5 shrink-0 border ${
        on ? 'bg-gold-soft border-gold-line' : 'bg-panel-2 border-border-subtle'
      }`}
    >
      <span
        className={`absolute top-0.5 w-3.5 h-3.5 ${
          on ? 'right-0.5 bg-gold' : 'left-0.5 bg-text-tertiary'
        }`}
      />
    </span>
  );
}

function Pill({
  children,
  outline = false,
}: {
  children: React.ReactNode;
  outline?: boolean;
}): JSX.Element {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 font-mono text-[10px] tracking-[0.1em] leading-3 uppercase ${
        outline
          ? 'border border-border-subtle text-text-tertiary'
          : 'bg-status-active/[0.06] border border-status-active/30 text-status-active'
      }`}
    >
      {children}
    </span>
  );
}

function StatusPill({
  status,
}: {
  status: 'active' | 'error' | 'disabled' | 'pending';
}): JSX.Element {
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
      label: 'off',
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

function ErrorBanner({ message, onTest }: { message: string; onTest: () => void }): JSX.Element {
  return (
    <div className="bg-status-failed/[0.06] border border-status-failed/30 border-l-2 border-l-status-failed px-4 py-3 flex items-center gap-3">
      <span className="font-mono text-xs leading-4 text-status-failed">✗</span>
      <span className="flex-1 font-mono text-xs leading-4 text-text-primary">{message}</span>
      <button
        type="button"
        onClick={onTest}
        className="inline-flex items-center px-3 py-1.5 border border-status-failed/30 font-mono text-[10px] tracking-[0.12em] leading-3 uppercase text-status-failed hover:bg-status-failed/10"
      >
        test connection
      </button>
    </div>
  );
}

function ConnectionSection({ connector }: { connector: ConnectorDetail }): JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
        <h2 className="m-0 font-sans text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
          connection
        </h2>
        <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
          {connector.transport}
        </span>
      </div>
      {connector.transport === 'remote' && connector.url && (
        <Field label="url" value={connector.url} />
      )}
      {connector.transport === 'stdio' && connector.command && (
        <Field
          label="command"
          value={`${connector.command} ${(connector.args ?? []).join(' ')}`.trim()}
        />
      )}
      <SecretsBlock connector={connector} />
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] tracking-[0.18em] leading-3 uppercase text-gold">
        {label}
      </span>
      <div className="bg-panel-2 border border-border-subtle px-3 py-2.5 font-mono text-[13px] leading-4 text-text-primary">
        {value}
      </div>
    </div>
  );
}

function SecretsBlock({ connector }: { connector: ConnectorDetail }): JSX.Element | null {
  if (connector.secrets.length === 0) return null;
  return (
    <div className="bg-panel border border-border-subtle px-4 py-3.5 flex flex-col gap-2">
      <span className="font-mono text-[10px] tracking-[0.18em] leading-3 uppercase text-gold">
        environment
      </span>
      {connector.secrets.map((secret) => (
        <SecretRow
          key={secret.key}
          connectorId={connector.id}
          secretKey={secret.key}
          last4={secret.last4}
        />
      ))}
    </div>
  );
}

function SecretRow({
  connectorId,
  secretKey,
  last4,
}: {
  connectorId: string;
  secretKey: string;
  last4: string;
}): JSX.Element {
  const [revealed, setRevealed] = useState<string | null>(null);
  const reveal = useRevealSecret();
  const toast = useToast();

  const handleReveal = (): void => {
    if (revealed) {
      setRevealed(null);
      return;
    }
    reveal.mutate(
      { id: connectorId, key: secretKey },
      {
        onSuccess: (data) => {
          setRevealed(data.value);
          setTimeout(() => setRevealed(null), 10_000);
        },
        onError: (err) => {
          // 429 — rate limited
          toast.warn(`aguarde alguns segundos pra revelar de novo (${err.message})`);
        },
      },
    );
  };

  return (
    <div className="flex items-center gap-2.5">
      <span className="shrink-0 w-[200px] font-mono text-[11px] leading-[14px] text-text-secondary">
        {secretKey}
      </span>
      <div className="flex-1 flex items-center gap-2.5 bg-panel-2 border border-border-subtle px-3 py-2">
        <span className="flex-1 font-mono text-xs leading-4 text-text-primary">
          {revealed ?? `••••••••••••${last4}`}
        </span>
        <button
          type="button"
          onClick={handleReveal}
          aria-label={revealed ? 'Hide value' : 'Reveal value'}
          className={`inline-flex items-center justify-center ${
            revealed ? 'text-gold' : 'text-text-tertiary hover:text-text-primary'
          }`}
        >
          {revealed ? '◉' : '○'}
        </button>
      </div>
    </div>
  );
}

function ToolPermissionsSection({ connector }: { connector: ConnectorDetail }): JSX.Element {
  const setPerm = useSetToolPermission();
  const setBulk = useSetBulkPermission();
  const groups: Record<ToolCategory, ConnectorDetail['tools']> = {
    read: connector.tools.filter((t) => t.category === 'read'),
    write: connector.tools.filter((t) => t.category === 'write'),
    interactive: connector.tools.filter((t) => t.category === 'interactive'),
  };
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
        <h2 className="m-0 font-sans text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
          tool permissions
        </h2>
        <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
          {connector.tools.length} tools
        </span>
      </div>
      {connector.tools.length === 0 && (
        <p className="font-mono text-[11px] text-text-tertiary">
          No tools discovered yet. Run Test connection to discover tools.
        </p>
      )}
      {(Object.keys(groups) as ToolCategory[]).map((category) => {
        const tools = groups[category];
        if (tools.length === 0) return null;
        const decisions = new Set(tools.map((t) => t.permission));
        const bulkValue: ToolPermission | 'mixed' =
          decisions.size === 1 ? [...decisions][0]! : 'mixed';
        return (
          <CategoryPanel
            key={category}
            label={category}
            tools={tools}
            bulkValue={bulkValue}
            onChangeTool={(toolName, permission) =>
              setPerm.mutate({ connectorId: connector.id, toolName, permission })
            }
            onBulkChange={(permission) =>
              setBulk.mutate({ connectorId: connector.id, category, permission })
            }
          />
        );
      })}
    </section>
  );
}

function CategoryPanel({
  label,
  tools,
  bulkValue,
  onChangeTool,
  onBulkChange,
}: {
  label: string;
  tools: ConnectorDetail['tools'];
  bulkValue: ToolPermission | 'mixed';
  onChangeTool: (toolName: string, permission: ToolPermission) => void;
  onBulkChange: (permission: ToolPermission) => void;
}): JSX.Element {
  return (
    <div className="bg-panel border border-border-subtle flex flex-col">
      <div className="flex items-center justify-between bg-sidebar border-b border-border-subtle px-[18px] py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11px] font-medium tracking-[0.18em] leading-[14px] uppercase text-gold">
            {label}
          </span>
          <span className="font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary">
            {tools.length} tools
          </span>
        </div>
        <BulkSelect value={bulkValue} onChange={onBulkChange} />
      </div>
      <div className="flex flex-col">
        {tools.map((tool, i) => (
          <ToolRow
            key={tool.toolName}
            tool={tool}
            last={i === tools.length - 1}
            onChange={(p) => onChangeTool(tool.toolName, p)}
          />
        ))}
      </div>
    </div>
  );
}

function BulkSelect({
  value,
  onChange,
}: {
  value: ToolPermission | 'mixed';
  onChange: (p: ToolPermission) => void;
}): JSX.Element {
  return (
    <select
      value={value === 'mixed' ? '' : value}
      onChange={(e) => {
        const v = e.target.value as ToolPermission;
        if (v) onChange(v);
      }}
      className="bg-gold-soft border border-gold-line font-mono text-[10px] tracking-[0.1em] leading-3 uppercase text-gold px-2.5 py-1"
    >
      {value === 'mixed' && <option value="">mixed</option>}
      <option value="always_allow">always allow</option>
      <option value="ask">ask</option>
      <option value="never">never</option>
    </select>
  );
}

function ToolRow({
  tool,
  last,
  onChange,
}: {
  tool: ConnectorDetail['tools'][number];
  last: boolean;
  onChange: (p: ToolPermission) => void;
}): JSX.Element {
  return (
    <div
      className={`flex items-center gap-3.5 px-[18px] py-2.5 ${
        last ? '' : 'border-b border-border-subtle'
      }`}
    >
      <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
        <span className="font-mono text-xs font-medium tracking-[0.02em] leading-4 text-text-primary">
          {tool.toolName}
        </span>
        {tool.description && (
          <span className="font-sans text-[11px] leading-[16px] text-text-secondary">
            {tool.description}
          </span>
        )}
      </div>
      <DecisionToggle decision={tool.permission} onChange={onChange} />
    </div>
  );
}

function DecisionToggle({
  decision,
  onChange,
}: {
  decision: ToolPermission;
  onChange: (p: ToolPermission) => void;
}): JSX.Element {
  return (
    <span className="inline-flex shrink-0 border border-border-subtle">
      {(['always_allow', 'ask', 'never'] as const).map((kind, i) => {
        const active = decision === kind;
        const label = kind === 'always_allow' ? 'always allow' : kind === 'ask' ? 'ask' : 'never';
        let cls = 'text-text-tertiary hover:text-text-primary hover:bg-panel-2';
        if (active) {
          cls =
            kind === 'never' ? 'bg-status-failed/10 text-status-failed' : 'bg-gold-soft text-gold';
        }
        return (
          <button
            key={kind}
            type="button"
            onClick={() => onChange(kind)}
            className={`px-2.5 py-1 ${
              i > 0 ? 'border-l border-border-subtle' : ''
            } font-mono text-[10px] tracking-[0.06em] leading-3 uppercase ${cls}`}
          >
            {label}
          </button>
        );
      })}
    </span>
  );
}

function ActivitySection({
  feed,
  loading,
}: {
  feed: ConnectorInvocationApi[];
  loading: boolean;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
        <h2 className="m-0 font-sans text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
          activity
        </h2>
        <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
          {loading ? 'loading…' : feed.length === 0 ? 'no invocations yet' : `last ${feed.length}`}
        </span>
      </div>
      {feed.length === 0 ? (
        <div className="bg-panel border border-border-subtle px-6 py-8 flex flex-col items-center gap-1 text-center">
          <span className="font-sans text-[13px] leading-[1.6] text-text-secondary">
            Once tools start firing, you'll see invocations here with timing and tool names.
          </span>
        </div>
      ) : (
        <div className="bg-panel border border-border-subtle flex flex-col">
          {feed.map((entry) => (
            <ActivityRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </section>
  );
}

function ActivityRow({ entry }: { entry: ConnectorInvocationApi }): JSX.Element {
  const ok = entry.result === 'ok';
  return (
    <div className="flex items-center gap-3.5 px-[18px] py-2.5 border-b border-border-subtle">
      <span className="shrink-0 inline-flex items-center justify-center w-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-status-active' : 'bg-status-failed'}`}
        />
      </span>
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
        className={`shrink-0 w-4 inline-flex items-center justify-center font-mono text-xs leading-4 ${
          ok ? 'text-status-active' : 'text-status-failed'
        }`}
      >
        {ok ? '✓' : '✗'}
      </span>
      <span className="shrink-0 w-[68px] text-right font-mono text-[11px] tracking-[0.04em] leading-[14px] text-text-tertiary">
        {entry.durationMs}ms
      </span>
    </div>
  );
}

function formatRelative(iso: string): string {
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
