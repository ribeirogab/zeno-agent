/**
 * Add Rule modal — spec 0047.
 *
 * Pattern input + live "matches X tools" preview. SAVE is enabled when the
 * pattern is non-empty AND zero or more matches (a 0-match warning is shown
 * but doesn't block; future tools may match the pattern when installed).
 */

import { CornerBrackets, Dialog, DialogContent, DialogTitle, Input } from '@zeno/ui';
import type { JSX } from 'react';
import { useEffect, useId, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { useCreateApprovalRule } from '@/lib/use-approval-rules';
import { type PreviewResponse, useRuleMatchPreview } from '@/lib/use-rule-match-preview';

const PATTERN_REGEX = /^[\w*-]+(__[\w*-]+)*$/;

interface Props {
  onClose: () => void;
}

export function AddRuleModal({ onClose }: Props): JSX.Element {
  const create = useCreateApprovalRule();
  const preview = useRuleMatchPreview();
  const [pattern, setPattern] = useState('');
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const helpId = useId();

  const valid = pattern.length > 0 && PATTERN_REGEX.test(pattern);
  const previewMutate = preview.mutate;

  // Debounced preview: trigger 350ms after last keystroke when pattern is valid.
  useEffect(() => {
    setPreviewData(null);
    if (!valid) return;
    const timer = setTimeout(() => {
      previewMutate(pattern, {
        onSuccess: (data) => setPreviewData(data),
        onError: () => setPreviewData(null),
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [pattern, valid, previewMutate]);

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    try {
      await create.mutateAsync({ pattern });
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { error?: string } | null;
        setError(
          body?.error === 'pattern_already_exists'
            ? 'a rule with this pattern already exists'
            : (body?.error ?? `api ${err.status}`),
        );
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[560px]">
        <CornerBrackets />
        <div className="flex items-start gap-3 border-b border-border-subtle pt-[22px] px-7 pb-3.5">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-gold">
              add · sensitive rule
            </span>
            <DialogTitle className="m-0 font-serif text-[22px] tracking-[-0.015em] leading-7 text-text-primary">
              New <em className="italic text-gold">sensitive tool</em> rule
            </DialogTitle>
          </div>
        </div>
        <div className="flex flex-col gap-[18px] px-7 py-[22px]">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={inputId}
              className="font-mono text-[10px] tracking-[0.18em] leading-3 uppercase text-gold"
            >
              pattern
            </label>
            <Input
              id={inputId}
              type="text"
              value={pattern}
              placeholder="mcp__github-app-*__merge_pull_request"
              onChange={(e) => setPattern(e.target.value)}
              aria-describedby={helpId}
              aria-invalid={pattern.length > 0 && !valid}
              className={`bg-panel-2 border ${
                pattern.length > 0 && !valid
                  ? 'border-status-failed/50'
                  : valid
                    ? 'border-gold-line'
                    : 'border-border-subtle'
              } px-3 py-2.5 font-mono text-[13px] text-text-primary`}
            />
            <span id={helpId} className="font-mono text-[11px] leading-[14px] text-text-tertiary">
              Glob (`*` matches any chars). Examples: `mcp__github__*`, `*delete*`, full literal.
            </span>
          </div>
          <PreviewStrip preview={previewData} pending={preview.isPending} valid={valid} />
          {error && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-status-failed/[0.06] border border-status-failed/30 border-l-2 border-l-status-failed">
              <span className="font-mono text-xs leading-4 text-status-failed">✗</span>
              <span className="flex-1 font-mono text-xs leading-4 text-text-primary">{error}</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2.5 bg-sidebar border-t border-border-subtle px-7 pt-4 pb-[22px]">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center px-3.5 py-2 border border-border-strong font-mono text-xs font-medium tracking-[0.06em] leading-4 uppercase text-text-primary hover:bg-panel-2 transition-colors duration-[120ms]"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!valid || create.isPending}
            className="inline-flex items-center px-3.5 py-2 bg-gold border border-gold font-mono text-xs font-semibold tracking-[0.06em] leading-4 uppercase text-text-ink hover:bg-gold-bright hover:border-gold-bright transition-colors duration-[120ms] disabled:opacity-50"
          >
            {create.isPending ? 'saving…' : 'save rule'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewStrip({
  preview,
  pending,
  valid,
}: {
  preview: PreviewResponse | null;
  pending: boolean;
  valid: boolean;
}): JSX.Element | null {
  if (!valid) return null;
  if (pending) {
    return (
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-gold/10 border border-gold-line border-l-2 border-l-gold">
        <span className="font-mono text-xs leading-4 text-gold">…</span>
        <span className="flex-1 font-mono text-xs leading-4 text-text-primary">
          evaluating pattern against installed tools…
        </span>
      </div>
    );
  }
  if (!preview) return null;
  if (preview.matchCount === 0) {
    return (
      <div className="flex flex-col gap-1 px-3.5 py-2.5 bg-gold/10 border border-gold-line border-l-2 border-l-gold">
        <span className="font-mono text-xs leading-4 text-gold">⚠ matches 0 tools</span>
        <span className="font-mono text-[11px] leading-[14px] text-text-tertiary">
          {preview.totalInventory} tools currently installed · this rule activates when a matching
          tool is added later
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 px-3.5 py-2.5 bg-status-active/[0.06] border border-status-active/30 border-l-2 border-l-status-active">
      <span className="font-mono text-xs leading-4 text-status-active">
        ✓ matches {preview.matchCount} tool{preview.matchCount === 1 ? '' : 's'}
      </span>
      <span className="font-mono text-[11px] leading-[14px] text-text-tertiary truncate">
        {preview.samples.join(' · ')}
        {preview.matchCount > preview.samples.length ? ' · …' : ''}
      </span>
    </div>
  );
}
