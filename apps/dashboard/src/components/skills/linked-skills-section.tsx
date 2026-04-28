import type { JSX } from 'react';
import { useState } from 'react';
import { LinkSkillPickerModal } from '@/components/skills/link-skill-picker-modal';
import { useConnectorSkills, useReplaceConnectorSkills } from '@/lib/use-connector-skills';

/**
 * Spec 0052 — Linked skills section embedded in /connectors/:id (Paper artboard
 * C-skill-1). The pre-tool-use hook injects linked-skill bodies as
 * additionalContext before any `mcp__<connector_slug>__*` tool fires.
 */
export function LinkedSkillsSection({
  connectorId,
  connectorSlug,
}: {
  connectorId: string;
  connectorSlug: string;
}): JSX.Element {
  const linked = useConnectorSkills(connectorId);
  const remove = useReplaceConnectorSkills();
  const [pickerOpen, setPickerOpen] = useState(false);

  const list = linked.data ?? [];

  const removeOne = async (skillId: string) => {
    const remaining = list.filter((s) => s.id !== skillId).map((s) => s.id);
    await remove.mutateAsync({ connectorId, skillIds: remaining });
  };

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
        <div className="flex items-baseline gap-3">
          <h2 className="m-0 font-sans text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
            linked skills
          </h2>
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-text-tertiary">
            {list.length} {list.length === 1 ? 'skill' : 'skills'}
          </span>
        </div>
        <span className="font-mono text-[10px] tracking-[0.06em] text-text-tertiary">
          spec 0052 · injected as context before any mcp__{connectorSlug}__* tool fires
        </span>
      </header>
      {list.length === 0 ? (
        <div className="flex items-center justify-between bg-panel-2 border border-dashed border-border-subtle px-4 py-3">
          <span className="font-sans text-[13px] text-text-secondary">
            No skills linked. The agent decides when to load skills on its own via auto-discovery.
          </span>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 border border-gold-line bg-gold-soft font-mono text-[11px] font-semibold tracking-[0.06em] uppercase text-gold hover:bg-gold-soft/80"
          >
            + link a skill
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((s) => (
            <div
              key={s.id}
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
                  aria-label="Skill"
                >
                  <title>Skill</title>
                  <path d="M6 3 H18 V21 H6 Z" />
                  <path d="M9 8 H15 M9 12 H15 M9 16 H13" />
                </svg>
              </span>
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="font-mono text-[12px] font-medium tracking-[0.02em] text-text-primary">
                  {s.name}
                </span>
                <span className="font-sans text-[11px] leading-[16px] text-text-secondary">
                  {s.description}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeOne(s.id)}
                aria-label={`unlink ${s.name}`}
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
            + link another skill
          </button>
        </div>
      )}
      {pickerOpen && (
        <LinkSkillPickerModal
          connectorId={connectorId}
          connectorSlug={connectorSlug}
          initialLinkedIds={list.map((s) => s.id)}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </section>
  );
}
