/**
 * /settings → "Sensitive tools" section. Spec 0047.
 *
 * Lists rules from `approval_rules` with source icon (🤖 auto / 👤 manual /
 * 📋 migrated). Trash button enabled only for `manual` and `yaml-migrated`
 * rows; `auto` rows show "managed" inline (auto-cascade owns their lifecycle).
 */

import { useToast } from '@zeno/ui';
import type { JSX } from 'react';
import { useState } from 'react';
import { AddRuleModal } from '@/components/settings/add-rule-modal';
import { ApiError } from '@/lib/api-client';
import {
  type ApprovalRuleWithMatchStatus,
  useApprovalRules,
  useDeleteApprovalRule,
  useRemoveOrphanRules,
} from '@/lib/use-approval-rules';

export function SensitiveToolsSection(): JSX.Element {
  const rules = useApprovalRules();
  const remove = useDeleteApprovalRule();
  const removeOrphans = useRemoveOrphanRules();
  const toast = useToast();
  const [adding, setAdding] = useState(false);

  const items = rules.data ?? [];
  // Spec 0048 Q6: orphan = manual/yaml-migrated rule that doesn't match any
  // currently-installed tool. Auto rules are exempt (managed by lifecycle).
  const orphanCount = items.filter((r) => r.matchStatus?.isOrphan).length;

  const handleDelete = (id: string): void => {
    remove.mutate(id, {
      onError: (err) => {
        if (err instanceof ApiError && err.status === 403) {
          toast.warn('this rule is system-managed; uninstall the related connector to remove it');
        }
      },
    });
  };

  const handleRemoveOrphans = (): void => {
    if (
      !confirm(
        `Remove ${orphanCount} orphan rule${orphanCount === 1 ? '' : 's'}? Auto-managed rules are not affected.`,
      )
    ) {
      return;
    }
    removeOrphans.mutate();
  };

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
        <h2 className="m-0 font-sans text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
          sensitive tools
        </h2>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
            {rules.isLoading ? 'loading…' : `${items.length} rule${items.length === 1 ? '' : 's'}`}
            {orphanCount > 0 && (
              <span
                className="ml-2 text-[#C99F4F]"
                title="Spec 0048 Q6: orphan rule (no current tool matches the pattern)"
              >
                · ⚠ {orphanCount} orphan{orphanCount === 1 ? '' : 's'}
              </span>
            )}
          </span>
          {orphanCount > 0 && (
            <button
              type="button"
              onClick={handleRemoveOrphans}
              disabled={removeOrphans.isPending}
              className="font-mono text-[10px] tracking-[0.08em] uppercase text-status-failed hover:underline disabled:opacity-50"
            >
              remove orphans
            </button>
          )}
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="font-mono text-[10px] tracking-[0.08em] uppercase text-gold hover:underline"
          >
            + add rule
          </button>
        </div>
      </header>
      {items.length === 0 && !rules.isLoading && (
        <p className="m-0 font-sans text-[13px] leading-5 text-text-tertiary px-1">
          No sensitive tools configured · all tool calls go through the classifier without an early
          gate.
        </p>
      )}
      {items.length > 0 && (
        <div className="bg-panel border border-border-subtle flex flex-col">
          {items.map((rule, i) => (
            <Row
              key={rule.id}
              rule={rule}
              last={i === items.length - 1}
              onDelete={() => handleDelete(rule.id)}
              deleting={remove.isPending}
            />
          ))}
        </div>
      )}
      {adding && <AddRuleModal onClose={() => setAdding(false)} />}
    </section>
  );
}

function Row({
  rule,
  last,
  onDelete,
  deleting,
}: {
  rule: ApprovalRuleWithMatchStatus;
  last: boolean;
  onDelete: () => void;
  deleting: boolean;
}): JSX.Element {
  const isAuto = rule.source === 'auto';
  const isOrphan = rule.matchStatus?.isOrphan ?? false;
  return (
    <div
      className={`flex items-center gap-4 px-5 py-3 ${last ? '' : 'border-b border-border-subtle'}`}
    >
      <span className="flex-1 font-mono text-[12px] tracking-[0.02em] leading-4 text-text-primary truncate">
        {isOrphan && (
          <span
            className="text-[#C99F4F] mr-1.5"
            title="No current tools match this pattern. Recently uninstalled connector?"
          >
            ⚠
          </span>
        )}
        {rule.pattern}
      </span>
      <span className="w-[120px] shrink-0 font-mono text-[10px] tracking-[0.1em] leading-3 uppercase text-text-tertiary">
        <SourceBadge source={rule.source} />
      </span>
      <span className="w-[110px] shrink-0 font-mono text-[10px] leading-3 text-text-tertiary">
        {formatRelative(rule.createdAt)}
      </span>
      <span className="w-[80px] shrink-0 inline-flex justify-end">
        {isAuto ? (
          <span
            className="font-mono text-[10px] tracking-[0.08em] uppercase text-text-tertiary"
            title="this rule is system-managed; uninstall the related connector to remove it"
          >
            managed
          </span>
        ) : (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="font-mono text-[10px] tracking-[0.08em] uppercase text-status-failed hover:underline disabled:opacity-50"
          >
            delete
          </button>
        )}
      </span>
    </div>
  );
}

function SourceBadge({ source }: { source: ApprovalRuleWithMatchStatus['source'] }): JSX.Element {
  const label = source === 'auto' ? '🤖 auto' : source === 'manual' ? '👤 manual' : '📋 migrated';
  return <span>{label}</span>;
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
