import type { JSX } from 'react';
import { useState } from 'react';
import { LinkCronConnectorPickerModal } from '@/components/crons/link-connector-picker-modal';
import { useCronConnectors, useReplaceCronConnectors } from '@/lib/use-cron-connectors';

/**
 * Spec 0054 — Linked connectors section embedded in /crons/:id. The cron
 * runner appends `linked_connectors: <slugs>` to the [zeno_context] block
 * as a HINT — the connector-permission gate (spec 0050) stays the single
 * allow/deny authority. Use of an unlinked connector emits a
 * `cron_used_unlinked_connector` audit log.
 */
export function LinkedCronConnectorsSection({
  cronId,
  cronName,
}: {
  cronId: string;
  cronName: string;
}): JSX.Element {
  const linked = useCronConnectors(cronId);
  const remove = useReplaceCronConnectors();
  const [pickerOpen, setPickerOpen] = useState(false);

  const list = linked.data ?? [];

  const removeOne = async (connectorId: string) => {
    const remaining = list.filter((c) => c.id !== connectorId).map((c) => c.id);
    await remove.mutateAsync({ cronId, connectorIds: remaining });
  };

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
        <div className="flex items-baseline gap-3">
          <h2 className="m-0 font-sans text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
            linked connectors
          </h2>
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-text-tertiary">
            {list.length} {list.length === 1 ? 'connector' : 'connectors'}
          </span>
        </div>
        <span className="font-mono text-[10px] tracking-[0.06em] text-text-tertiary">
          spec 0054 · hint mode · gate stays the single guardrail
        </span>
      </header>
      {list.length === 0 ? (
        <div className="flex items-center justify-between bg-panel-2 border border-dashed border-border-subtle px-4 py-3">
          <span className="font-sans text-[13px] text-text-secondary">
            No connectors linked. The cron uses whatever the gate permits.
          </span>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 border border-gold-line bg-gold-soft font-mono text-[11px] font-semibold tracking-[0.06em] uppercase text-gold hover:bg-gold-soft/80"
          >
            + link a connector
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 px-3.5 py-2.5 bg-gold-soft/[0.04] border border-gold-line border-l-2 border-l-gold"
            >
              <span className="shrink-0 w-7 h-7 grid place-items-center border border-gold-line bg-panel-2 text-gold">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  role="img"
                  aria-label="Connector"
                >
                  <title>Connector</title>
                  <path d="M9 7 V3 M15 7 V3 M9 21 V17 M15 21 V17" />
                  <path d="M5 7 H19 V13 A6 6 0 0 1 13 19 H11 A6 6 0 0 1 5 13 Z" />
                </svg>
              </span>
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="font-mono text-[12px] font-medium tracking-[0.02em] text-text-primary">
                  {c.slug}
                </span>
                <span className="font-sans text-[11px] leading-[16px] text-text-secondary">
                  {c.displayName}
                </span>
              </div>
              <span
                className={`shrink-0 font-mono text-[9px] tracking-[0.12em] uppercase ${
                  c.status === 'enabled'
                    ? 'text-status-active'
                    : c.status === 'disabled'
                      ? 'text-text-tertiary'
                      : 'text-status-failed'
                }`}
              >
                {c.status}
              </span>
              <button
                type="button"
                onClick={() => removeOne(c.id)}
                aria-label={`unlink ${c.slug}`}
                className="text-text-tertiary hover:text-status-failed font-mono text-base"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="self-start inline-flex items-center gap-2 px-3.5 py-2 border border-dashed border-gold-line bg-gold-soft/[0.06] font-mono text-[11px] font-medium tracking-[0.06em] uppercase text-gold hover:bg-gold-soft/[0.12]"
          >
            + link another connector
          </button>
        </div>
      )}
      {pickerOpen && (
        <LinkCronConnectorPickerModal
          cronId={cronId}
          cronName={cronName}
          initialLinkedIds={list.map((c) => c.id)}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </section>
  );
}
