/**
 * Generic binary-confirmation modal. Spec 0051 finding #1.
 *
 * Replaces ad-hoc `window.confirm()` calls with a styled modal that matches
 * the rest of the connector UI (Fraunces title, mono kicker, panel chrome).
 *
 * YAGNI: keep the API to a small surface. Binary confirm only — no
 * children-as-arbitrary-content escape hatch. If a flow needs a custom body
 * (form fields, multi-step), build a dedicated modal instead.
 */

import { CornerBrackets, Dialog, DialogContent, DialogTitle } from '@zeno/ui';
import type { JSX } from 'react';
import { useState } from 'react';
import { TypeToConfirm } from './type-to-confirm';

export interface ConfirmModalProps {
  title: string;
  description?: string;
  confirmLabel?: string;
  intent?: 'destructive' | 'neutral';
  /** When set, the CTA is gated by typing this exact string. */
  requireTypeToConfirm?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  title,
  description,
  confirmLabel,
  intent = 'neutral',
  requireTypeToConfirm,
  onConfirm,
  onClose,
}: ConfirmModalProps): JSX.Element {
  const [typed, setTyped] = useState('');
  const destructive = intent === 'destructive';
  const matches = requireTypeToConfirm == null || typed === requireTypeToConfirm;
  const canSubmit = matches;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[560px]">
        <CornerBrackets />
        <div
          className={`flex items-start gap-3 border-b ${
            destructive ? 'border-status-failed/30' : 'border-border-subtle'
          } pt-[22px] px-7 pb-3.5`}
        >
          <div className="flex flex-col gap-1">
            <span
              className={`font-mono text-[10px] tracking-[0.2em] leading-3 uppercase ${
                destructive ? 'text-status-failed' : 'text-gold'
              }`}
            >
              {destructive ? 'destructive · confirm' : 'confirm'}
            </span>
            <DialogTitle className="m-0 font-serif text-[22px] tracking-[-0.015em] leading-7 text-text-primary">
              {title}
            </DialogTitle>
          </div>
        </div>
        <div className="flex flex-col gap-[18px] px-7 py-[22px]">
          {description && (
            <p className="m-0 font-sans text-[13px] leading-[20px] text-text-secondary">
              {description}
            </p>
          )}
          {requireTypeToConfirm && (
            <TypeToConfirm expected={requireTypeToConfirm} value={typed} onChange={setTyped} mono />
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
            onClick={onConfirm}
            disabled={!canSubmit}
            className={`inline-flex items-center px-3.5 py-2 font-mono text-xs font-semibold tracking-[0.06em] leading-4 uppercase transition-colors duration-[120ms] disabled:opacity-50 ${
              destructive
                ? 'bg-status-failed border border-status-failed text-canvas hover:bg-status-failed/90 hover:border-status-failed/90'
                : 'bg-gold border border-gold text-canvas hover:bg-gold/90 hover:border-gold/90'
            }`}
          >
            {confirmLabel ?? 'confirm'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
