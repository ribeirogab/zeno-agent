/**
 * Spec 0071: backend card on /settings/backend.
 *
 * Reference Paper artboards: `0071 · /settings/backend (default | claude
 * expired | not configured)`. Status pill colors per spec:
 *   active        → jade  (#6bd3a3)
 *   expired/failed → carmine (#e8617a) → button label flips to "Re-authenticate"
 *   not_configured/untested → gold (#d9b362)
 */

import type { JSX } from 'react';
import type { BackendListItem, BackendStatus } from '@/lib/use-backends';

export interface BackendCardProps {
  backend: BackendListItem;
  /** Spec 0071: active profile id (default | work | ...) — drives the scope meta. */
  profileId: string;
  onConfigure: () => void;
}

const STATUS_COLOR: Record<BackendStatus, { dot: string; text: string; border: string }> = {
  active: {
    dot: 'bg-status-active',
    text: 'text-status-active',
    border: 'border-status-active/40',
  },
  expired: {
    dot: 'bg-status-failed',
    text: 'text-status-failed',
    border: 'border-status-failed/50',
  },
  failed: {
    dot: 'bg-status-failed',
    text: 'text-status-failed',
    border: 'border-status-failed/50',
  },
  untested: { dot: 'bg-gold', text: 'text-gold', border: 'border-gold-deep/60' },
  not_configured: { dot: 'bg-gold', text: 'text-gold', border: 'border-gold-deep/60' },
};

const STATUS_LABEL: Record<BackendStatus, string> = {
  active: 'active',
  expired: 'expired',
  failed: 'failed',
  untested: 'untested',
  not_configured: 'not configured',
};

function formatLastTested(ts: number | null, status: BackendStatus): string {
  if (!ts) {
    return status === 'not_configured' ? 'never' : '—';
  }
  return new Date(ts)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z/, ' utc');
}

export function BackendCard({ backend, profileId, onConfigure }: BackendCardProps): JSX.Element {
  const colors = STATUS_COLOR[backend.status];
  const isExpiredOrFailed = backend.status === 'expired' || backend.status === 'failed';
  const buttonLabel = isExpiredOrFailed ? 're-authenticate' : 'configure';
  const buttonClass = isExpiredOrFailed
    ? 'bg-status-failed text-text-ink hover:bg-status-failed/90'
    : backend.status === 'active'
      ? 'bg-panel-2 border border-border-strong text-text-primary hover:bg-panel'
      : 'bg-gold text-text-ink hover:bg-gold-bright';

  return (
    <div className="bg-panel border border-border-subtle rounded-md p-5 flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-md bg-panel-2 flex items-center justify-center overflow-hidden shrink-0">
          <img src={backend.logoUrl} alt="" className="w-8 h-8 object-contain" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[15px] font-medium text-text-primary">
              {backend.id}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full border ${colors.border}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
              <span className={`font-mono text-[10px] tracking-[0.08em] uppercase ${colors.text}`}>
                {STATUS_LABEL[backend.status]}
              </span>
            </span>
          </div>
          <div className="font-sans text-[13px] text-text-secondary mt-1">
            {backend.description}
          </div>
        </div>
        <button
          type="button"
          onClick={onConfigure}
          className={`shrink-0 inline-flex items-center justify-center px-[18px] py-2.5 rounded-md font-mono text-[11px] tracking-[0.08em] uppercase font-medium ${buttonClass}`}
        >
          {buttonLabel}
        </button>
      </div>

      {/* Meta row */}
      <div className="border-t border-border-subtle pt-4 flex items-start gap-8">
        <Meta
          label="last tested"
          value={formatLastTested(backend.last_tested_at, backend.status)}
        />
        <Meta label="storage" value="backend_credentials · aes-256-gcm" />
        <Meta label="scope" value={`profile · ${profileId}`} />
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <div className="font-mono text-[10px] tracking-[0.08em] uppercase text-text-tertiary">
        {label}
      </div>
      <div className="font-mono text-[13px] text-text-primary">{value}</div>
    </div>
  );
}
