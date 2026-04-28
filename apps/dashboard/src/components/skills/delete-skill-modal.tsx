import { CornerBrackets, Dialog, DialogContent, DialogTitle } from '@zeno/ui';
import type { JSX } from 'react';
import { useState } from 'react';
import { TypeToConfirm } from '@/components/shared/type-to-confirm';
import { type SkillDetail, useDeleteSkill } from '@/lib/use-skills';

export function DeleteSkillModal({
  skill,
  onClose,
  onDeleted,
}: {
  skill: SkillDetail;
  onClose: () => void;
  onDeleted: () => void;
}): JSX.Element {
  const remove = useDeleteSkill();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const matches = typed === skill.name;

  const handleDelete = async () => {
    setError(null);
    try {
      await remove.mutateAsync({ id: skill.id, name: skill.name });
      onClose();
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[640px]">
        <CornerBrackets />
        <div className="flex items-start gap-3 border-b border-status-failed/30 pt-[22px] px-7 pb-3.5">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-status-failed">
              destructive · delete skill
            </span>
            <DialogTitle className="m-0 font-serif text-[22px] tracking-[-0.015em] leading-7 text-text-primary">
              Delete <em className="italic text-gold">{skill.name}</em> ?
            </DialogTitle>
          </div>
        </div>
        <div className="flex flex-col gap-[18px] px-7 py-[22px]">
          <p className="m-0 font-sans text-[13px] leading-[18px] text-text-secondary">
            The skill will be removed from the database and the filesystem. Links to 0 connector(s)
            will be dissolved automatically. This can't be undone.
          </p>
          <div className="bg-panel-2 border border-border-subtle px-3.5 py-2.5 flex flex-col gap-2">
            <CascadeRow label="SKILL ROW" outcome="— delete" tone="destructive" />
            <CascadeRow label="SKILL.MD ON FS" outcome="— unlink" tone="destructive" />
            <CascadeRow label="CONNECTOR LINKS" outcome="— dissolve (cascade)" tone="destructive" />
            <CascadeRow label="ACTIVITY LOG" outcome="— retained" tone="success" />
          </div>
          <TypeToConfirm
            label={`type the skill name "${skill.name}" to confirm`}
            expected={skill.name}
            value={typed}
            onChange={setTyped}
            mono
          />
          {error && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-status-failed/[0.06] border border-status-failed/30 border-l-2 border-l-status-failed">
              <span className="font-mono text-xs leading-4 text-status-failed">✗</span>
              <span className="flex-1 font-mono text-xs leading-4 text-text-primary">{error}</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2.5 bg-sidebar border-t border-border-subtle px-7 pt-4 pb-[22px]">
          <span className="font-mono text-[10px] tracking-[0.06em] text-text-tertiary">
            {matches ? 'name matches · ready to delete' : 'type the skill name to enable delete'}
          </span>
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
              onClick={handleDelete}
              disabled={!matches || remove.isPending}
              className="inline-flex items-center px-3.5 py-2 bg-status-failed border border-status-failed font-mono text-xs font-bold tracking-[0.06em] uppercase text-canvas hover:bg-status-failed/90 hover:border-status-failed/90 disabled:opacity-50 transition-colors duration-[120ms]"
            >
              {remove.isPending ? 'deleting…' : 'delete skill'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CascadeRow({
  label,
  outcome,
  tone,
}: {
  label: string;
  outcome: string;
  tone: 'destructive' | 'success';
}): JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-text-secondary">
        {label}
      </span>
      <span
        className={`font-mono text-[11px] tracking-[0.04em] ${
          tone === 'destructive' ? 'text-status-failed' : 'text-status-active'
        }`}
      >
        {outcome}
      </span>
    </div>
  );
}
