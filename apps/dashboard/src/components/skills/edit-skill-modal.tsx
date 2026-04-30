/**
 * Spec 0062 — edit description modal.
 * The modal only edits the skill's description (frontmatter `description`).
 * Body content is edited inline via the file tree + editor on the detail
 * page. The PATCH endpoint also re-writes the SKILL.md frontmatter on disk
 * so dashboard description and FS stay in sync.
 *
 * Available only for source=dashboard. The detail page hides the trigger
 * for zeno_default + profile, but the modal also defends in depth.
 */

import { CornerBrackets, Dialog, DialogContent, DialogTitle } from '@zeno/ui';
import type { JSX } from 'react';
import { useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { type SkillDetail, useEditSkillDescription } from '@/lib/use-skills';

export function EditSkillModal({
  skill,
  onClose,
}: {
  skill: SkillDetail;
  onClose: () => void;
}): JSX.Element | null {
  const edit = useEditSkillDescription();
  const [description, setDescription] = useState(skill.description);
  const [error, setError] = useState<string | null>(null);

  if (skill.source !== 'dashboard') return null;

  const handleSave = async (): Promise<void> => {
    setError(null);
    try {
      await edit.mutateAsync({ id: skill.id, description });
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { message?: string } | null;
        setError(body?.message ?? `api ${err.status}`);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[640px]">
        <CornerBrackets />
        <div className="flex items-start gap-3 border-b border-border-subtle pt-[22px] px-7 pb-3.5">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
              skill · edit description
            </span>
            <DialogTitle className="m-0 font-serif text-[22px] tracking-[-0.015em] leading-7 text-text-primary">
              Edit <em className="italic text-gold">{skill.name}</em>
            </DialogTitle>
          </div>
        </div>
        <div className="flex flex-col gap-3 px-7 py-[22px]">
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-text-tertiary">
            description (1–1000 chars)
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            spellCheck={false}
            maxLength={1000}
            className="bg-panel-2 border border-border-subtle px-4 py-3 font-sans text-[13px] leading-[19px] text-text-primary min-h-[140px] resize-y"
          />
          <span className="font-mono text-[10px] text-text-tertiary">
            this also re-writes the SKILL.md frontmatter on disk
          </span>
          {error && (
            <div className="flex items-start gap-2.5 px-3.5 py-2.5 bg-status-failed/[0.06] border border-status-failed/30 border-l-2 border-l-status-failed">
              <span className="font-mono text-xs leading-4 text-status-failed">✗</span>
              <pre className="flex-1 font-mono text-xs leading-4 text-text-primary whitespace-pre-wrap m-0">
                {error}
              </pre>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2.5 bg-sidebar border-t border-border-subtle px-7 pt-4 pb-[22px]">
          <span className="font-mono text-[10px] tracking-[0.06em] text-text-tertiary">
            applies on next agent query
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
              onClick={handleSave}
              disabled={edit.isPending || description.length === 0}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-gold border border-gold font-mono text-xs font-bold tracking-[0.06em] uppercase text-text-ink hover:bg-gold/90 disabled:opacity-50 transition-colors duration-[120ms]"
            >
              {edit.isPending ? 'saving…' : 'save'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
