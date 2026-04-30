import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useState } from 'react';
import { ChannelsEditSecretsModal } from '@/components/channels/channels-edit-secrets-modal';
import { ChannelsUninstallConfirmDialog } from '@/components/channels/channels-uninstall-confirm-dialog';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { type ChannelDetail, useChannel, useChannelsCatalog } from '@/lib/use-channels';

/**
 * Spec 0059: /channels/:id detail page (Paper artboard CH2).
 *
 * Trimmed vs the connectors detail page:
 *   - NO transport / command / args / url section
 *   - NO tool catalog list
 *   - NO invocation history list
 *   - NO enabled/disabled toggle (channels lack the runtime concept today)
 *
 * Sections kept:
 *   1. Header: icon + name + status pill + meta + uninstall in overflow
 *   2. Secrets (masked, with edit button)
 *   3. Activity: last verified + last error cards
 *
 * StatusPill is copied verbatim from connectors.index.tsx (variant 'off',
 * NOT 'disabled' which connectors.$id.tsx uses). The DB-status to pill
 * mapping is also copied from connectors.index.tsx lines 152-159.
 */
export const Route = createFileRoute('/_authed/channels/$id')({
  component: ChannelDetailScreen,
});

function ChannelDetailScreen(): JSX.Element {
  const { id } = Route.useParams();
  const channel = useChannel(id);
  const catalog = useChannelsCatalog();
  const [editOpen, setEditOpen] = useState(false);
  const [uninstallOpen, setUninstallOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  if (channel.isLoading) {
    return (
      <>
        <DashboardTopstrip
          crumbs={[
            { label: 'channels', to: '/channels' },
            { label: '…', current: true },
          ]}
        />
        <main className="px-[54px] py-12 max-w-[1440px] mx-auto">
          <span className="font-mono text-xs text-text-tertiary">loading…</span>
        </main>
      </>
    );
  }

  if (!channel.data) {
    return (
      <>
        <DashboardTopstrip
          crumbs={[
            { label: 'channels', to: '/channels' },
            { label: 'not found', current: true },
          ]}
        />
        <main className="px-[54px] py-12 max-w-[1440px] mx-auto flex flex-col gap-3">
          <h1 className="m-0 font-mono text-2xl text-text-primary">channel not found</h1>
          <p className="m-0 font-sans text-sm text-text-secondary">
            This channel may have been uninstalled. Return to{' '}
            <button
              type="button"
              onClick={() => void navigate({ to: '/channels' })}
              className="text-gold hover:text-gold-bright"
            >
              /channels
            </button>
            .
          </p>
        </main>
      </>
    );
  }

  const ch = channel.data;
  const catalogEntry = catalog.data?.find((e) => e.id === ch.catalogId) ?? null;
  // visualStatus mapping copied from connectors.index.tsx lines 152-159
  const visualStatus =
    ch.status === 'enabled'
      ? ch.lastError
        ? 'error'
        : 'active'
      : ch.status === 'disabled'
        ? 'off'
        : 'pending';

  return (
    <>
      <DashboardTopstrip
        crumbs={[
          { label: 'channels', to: '/channels' },
          { label: ch.slug, current: true },
        ]}
      />
      <main className="px-[54px] py-12 max-w-[1440px] mx-auto flex flex-col gap-10">
        <Header
          channel={ch}
          visualStatus={visualStatus}
          menuOpen={menuOpen}
          onToggleMenu={() => setMenuOpen((v) => !v)}
          onUninstall={() => {
            setMenuOpen(false);
            setUninstallOpen(true);
          }}
        />
        <SecretsSection channel={ch} onEdit={() => setEditOpen(true)} />
        <ActivitySection channel={ch} />
      </main>
      <ChannelsEditSecretsModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        channel={ch}
        catalogEntry={catalogEntry}
      />
      <ChannelsUninstallConfirmDialog
        open={uninstallOpen}
        onClose={() => setUninstallOpen(false)}
        channel={ch}
      />
    </>
  );
}

function Header({
  channel,
  visualStatus,
  menuOpen,
  onToggleMenu,
  onUninstall,
}: {
  channel: ChannelDetail;
  visualStatus: 'active' | 'error' | 'off' | 'pending';
  menuOpen: boolean;
  onToggleMenu: () => void;
  onUninstall: () => void;
}): JSX.Element {
  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-text-tertiary">
          channels
        </span>
        <span className="font-mono text-[11px] text-text-tertiary">/</span>
        <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-gold font-medium">
          {channel.slug}
        </span>
      </div>
      <div className="flex items-start gap-5">
        <div className="shrink-0 w-14 h-14 bg-panel border border-border-subtle rounded-lg flex items-center justify-center">
          {channel.iconUrl ? (
            <img src={channel.iconUrl} alt={channel.displayName} width={32} height={32} />
          ) : (
            <span className="font-mono text-2xl font-semibold text-text-tertiary">
              {channel.displayName.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <h1 className="m-0 font-mono text-3xl font-medium tracking-[-0.01em] leading-none text-text-primary">
            {channel.displayName}
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            <StatusPill status={visualStatus} />
            <span className="font-mono text-sm text-text-tertiary">·</span>
            <span className="font-mono text-sm text-text-secondary">
              {channel.description ?? channel.slug}
            </span>
            {channel.lastVerifiedAt ? (
              <>
                <span className="font-mono text-sm text-text-tertiary">·</span>
                <span className="font-mono text-sm text-text-secondary">
                  last verified {formatRelative(channel.lastVerifiedAt)}
                </span>
              </>
            ) : null}
          </div>
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={onToggleMenu}
            className="w-8 h-8 inline-flex items-center justify-center bg-transparent border border-border-subtle rounded font-mono text-base font-semibold text-text-secondary tracking-[0.1em] hover:bg-panel-2 transition-colors duration-[120ms]"
            aria-label="actions"
          >
            ⋯
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-10 z-20 min-w-[180px] bg-panel border border-border-subtle rounded shadow-lg flex flex-col py-1.5">
              <button
                type="button"
                onClick={onUninstall}
                className="text-left px-3 py-2 font-mono text-xs text-status-failed hover:bg-status-failed/[0.06] transition-colors duration-[120ms]"
              >
                uninstall {channel.displayName.toLowerCase()}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function SecretsSection({
  channel,
  onEdit,
}: {
  channel: ChannelDetail;
  onEdit: () => void;
}): JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-border-subtle pb-3">
        <h2 className="m-0 font-mono text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
          secrets
        </h2>
        <span className="font-mono text-[11px] tracking-[0.04em] text-text-tertiary">
          stored in connector_secrets · keys frozen by catalog
        </span>
      </div>
      <div className="flex flex-col bg-panel border border-border-subtle rounded-md overflow-hidden">
        {channel.secrets.length === 0 ? (
          <div className="px-5 py-4 font-mono text-xs text-text-tertiary">
            no secrets configured
          </div>
        ) : (
          channel.secrets.map((s, i, arr) => (
            <div
              key={s.key}
              className={`flex items-center gap-4 px-5 py-4 ${
                i < arr.length - 1 ? 'border-b border-border-subtle' : ''
              }`}
            >
              <div className="flex flex-col gap-1 w-[220px] shrink-0">
                <span className="font-mono text-xs font-medium text-text-primary tracking-[0.04em]">
                  {s.key}
                </span>
              </div>
              <div className="flex-1 flex items-center gap-3 px-3.5 py-2 bg-panel-2 rounded">
                <span className="flex-1 font-mono text-[13px] text-text-secondary tracking-[0.08em]">
                  ••••••••••••••••••••
                </span>
                <span className="font-mono text-[11px] text-text-tertiary">last4 · {s.last4}</span>
              </div>
            </div>
          ))
        )}
        <div className="flex items-center justify-between gap-4 px-5 py-3 bg-canvas border-t border-border-subtle">
          <span className="font-mono text-[11px] text-text-tertiary">
            Secrets are written via PATCH with mode='merge' — leave a field empty to keep current.
          </span>
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 inline-flex items-center gap-1.5 px-3.5 h-7 bg-transparent border border-gold rounded font-mono text-[11px] font-semibold tracking-[0.06em] uppercase text-gold hover:bg-gold-soft transition-colors duration-[120ms] whitespace-nowrap"
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
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            edit secrets
          </button>
        </div>
      </div>
    </section>
  );
}

function ActivitySection({ channel }: { channel: ChannelDetail }): JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-border-subtle pb-3">
        <h2 className="m-0 font-mono text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
          activity
        </h2>
        <span className="font-mono text-[11px] tracking-[0.04em] text-text-tertiary">
          populated when the worker boots and verifies the connection
        </span>
      </div>
      <div className="flex flex-row gap-4">
        <ActivityCard
          label="last verified"
          value={channel.lastVerifiedAt ? formatRelative(channel.lastVerifiedAt) : 'never'}
          detail={
            channel.lastVerifiedAt
              ? `${channel.lastVerifiedAt} · Socket Mode handshake ok`
              : 'No verification yet — waiting for next worker boot.'
          }
          icon={<CheckIcon />}
          accent={channel.lastVerifiedAt ? 'active' : 'muted'}
        />
        <ActivityCard
          label="last error"
          value={channel.lastError ? 'see below' : 'none'}
          detail={
            channel.lastError
              ? `${channel.lastError}${
                  channel.lastErrorAt ? ` · ${formatRelative(channel.lastErrorAt)}` : ''
                }`
              : 'No errors recorded since last successful verification.'
          }
          icon={<InfoIcon />}
          accent={channel.lastError ? 'error' : 'muted'}
        />
      </div>
    </section>
  );
}

function ActivityCard({
  label,
  value,
  detail,
  icon,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  icon: JSX.Element;
  accent: 'active' | 'error' | 'muted';
}): JSX.Element {
  const accentCls = {
    active: 'text-status-active',
    error: 'text-status-failed',
    muted: 'text-text-tertiary',
  }[accent];
  const valueCls = {
    active: 'text-text-primary',
    error: 'text-status-failed',
    muted: 'text-text-tertiary',
  }[accent];
  return (
    <div className="flex-1 bg-panel border border-border-subtle rounded-md px-5 py-4 flex flex-col gap-2">
      <div className={`flex items-center gap-2 ${accentCls}`}>
        {icon}
        <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-text-tertiary">
          {label}
        </span>
      </div>
      <span className={`font-mono text-base font-medium ${valueCls}`}>{value}</span>
      <span className="font-mono text-[11px] text-text-tertiary leading-snug break-words">
        {detail}
      </span>
    </div>
  );
}

function CheckIcon(): JSX.Element {
  return (
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
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function InfoIcon(): JSX.Element {
  return (
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
    >
      <circle cx={12} cy={12} r={10} />
      <line x1={12} y1={8} x2={12} y2={12} />
      <line x1={12} y1={16} x2={12.01} y2={16} />
    </svg>
  );
}

// StatusPill — copied verbatim from connectors.index.tsx (variant 'off',
// NOT 'disabled'). Per spec 0059 Track 4 we adopt index.tsx as canonical.
function StatusPill({ status }: { status: 'active' | 'error' | 'off' | 'pending' }): JSX.Element {
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
    off: {
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

// formatRelative — copied verbatim from connectors.index.tsx ~line 483.
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
