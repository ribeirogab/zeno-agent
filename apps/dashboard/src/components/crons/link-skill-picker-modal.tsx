import { CornerBrackets, Dialog, DialogContent, DialogTitle } from '@zeno/ui';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useReplaceCronSkills } from '@/lib/use-cron-skills';
import { useSkills } from '@/lib/use-skills';

export function LinkCronSkillPickerModal({
  cronId,
  cronName,
  initialLinkedIds,
  onClose,
}: {
  cronId: string;
  cronName: string;
  initialLinkedIds: string[];
  onClose: () => void;
}): JSX.Element {
  const skills = useSkills();
  const replace = useReplaceCronSkills();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(new Set(initialLinkedIds));
  }, [initialLinkedIds]);

  const all = skills.data ?? [];
  const initial = new Set(initialLinkedIds);
  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return all;
    return all.filter(
      (s) => s.name.toLowerCase().includes(f) || s.description.toLowerCase().includes(f),
    );
  }, [all, filter]);

  const linked = filtered.filter((s) => initial.has(s.id));
  const unlinked = filtered.filter((s) => !initial.has(s.id));
  const newCount = [...selected].filter((id) => !initial.has(id)).length;
  const removedCount = [...initial].filter((id) => !selected.has(id)).length;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleSave = async () => {
    setError(null);
    try {
      await replace.mutateAsync({ cronId, skillIds: [...selected] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[640px] max-h-[calc(100vh-48px)]">
        <CornerBrackets />
        <div className="flex items-start gap-3 border-b border-border-subtle pt-[22px] px-7 pb-3.5">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
              link skills · multi-select
            </span>
            <DialogTitle className="m-0 font-serif text-[22px] tracking-[-0.015em] leading-7 text-text-primary">
              Link skills to <em className="italic text-gold">{cronName}</em>
            </DialogTitle>
          </div>
        </div>
        <div className="flex flex-col gap-[18px] px-7 py-[22px] overflow-auto">
          <p className="m-0 font-sans text-[13px] leading-[18px] text-text-secondary">
            Selected skills are force-injected as a{' '}
            <span className="font-mono text-text-primary">[zeno_context]</span> block before the
            cron prompt fires. Already-linked skills are pre-selected.
          </p>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter by name or description…"
            className="bg-panel-2 border border-border-subtle px-3.5 py-2.5 font-mono text-[12px] text-text-primary placeholder:text-text-tertiary"
          />

          {linked.length > 0 && (
            <SkillRows rows={linked} selected={selected} initial={initial} onToggle={toggle} />
          )}
          {unlinked.length > 0 && (
            <>
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-text-tertiary">
                  unlinked · {unlinked.length} skill{unlinked.length === 1 ? '' : 's'}
                </span>
                <span className="flex-1 h-px bg-border-subtle" />
              </div>
              <SkillRows rows={unlinked} selected={selected} initial={initial} onToggle={toggle} />
            </>
          )}
          {all.length === 0 && (
            <p className="m-0 font-mono text-[12px] text-text-tertiary text-center py-6">
              No skills installed yet. Add a SKILL.md under /skills before linking.
            </p>
          )}
          {error && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-status-failed/[0.06] border border-status-failed/30">
              <span className="font-mono text-xs text-status-failed">✗</span>
              <span className="font-mono text-xs text-text-primary">{error}</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2.5 bg-sidebar border-t border-border-subtle px-7 pt-4 pb-[22px]">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[11px] tracking-[0.04em] text-text-primary">
              {selected.size} selected
              {newCount > 0 && <span className="text-status-active"> · +{newCount} new</span>}
              {removedCount > 0 && (
                <span className="text-status-failed"> · -{removedCount} removed</span>
              )}
            </span>
          </div>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center px-3.5 py-2 border border-border-strong font-mono text-xs font-medium tracking-[0.06em] uppercase text-text-primary hover:bg-panel-2 transition-colors duration-[120ms]"
            >
              cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={replace.isPending}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-gold border border-gold font-mono text-xs font-bold tracking-[0.06em] uppercase text-text-ink hover:bg-gold/90 disabled:opacity-50 transition-colors duration-[120ms]"
            >
              {replace.isPending ? 'saving…' : 'save links'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SkillRows({
  rows,
  selected,
  initial,
  onToggle,
}: {
  rows: Array<{ id: string; name: string; description: string }>;
  selected: Set<string>;
  initial: Set<string>;
  onToggle: (id: string) => void;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((s) => {
        const checked = selected.has(s.id);
        const wasLinked = initial.has(s.id);
        const isNew = checked && !wasLinked;
        const isRemoved = !checked && wasLinked;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onToggle(s.id)}
            className={`flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors duration-[120ms] ${
              isNew
                ? 'bg-status-active/[0.06] border border-status-active/30 border-l-2 border-l-status-active'
                : isRemoved
                  ? 'bg-status-failed/[0.06] border border-status-failed/30 border-l-2 border-l-status-failed'
                  : checked
                    ? 'bg-gold-soft/[0.06] border border-gold-line border-l-2 border-l-gold'
                    : 'bg-panel-2 border border-border-subtle hover:bg-panel'
            }`}
          >
            <span
              className={`shrink-0 w-4 h-4 grid place-items-center border ${
                checked
                  ? isNew
                    ? 'bg-status-active border-status-active'
                    : 'bg-gold border-gold'
                  : 'bg-transparent border-border-strong'
              }`}
            >
              {checked && (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#08090F"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  role="img"
                  aria-label="Selected"
                >
                  <title>Selected</title>
                  <path d="M5 13 L9 17 L19 7" />
                </svg>
              )}
            </span>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="font-mono text-[12px] font-medium tracking-[0.02em] text-text-primary">
                {s.name}
              </span>
              <span className="font-sans text-[11px] leading-[16px] text-text-secondary">
                {s.description}
              </span>
            </div>
            <span className="shrink-0 font-mono text-[9px] tracking-[0.12em] uppercase">
              {isNew ? (
                <span className="text-status-active">+ new</span>
              ) : isRemoved ? (
                <span className="text-status-failed">− removed</span>
              ) : wasLinked ? (
                <span className="text-gold">linked</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
