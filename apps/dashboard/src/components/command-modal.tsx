/**
 * `CommandModal` — read-only popover that displays the exact `zeno connector …`
 * command an operator must run to perform a mutating action. Visual reference:
 * vault/specs/2026-05-08-connectors-cli-first-design/artboards/A3-command-modal.png.
 *
 * Anatomy (matches A3):
 *   - Single panel (~80px tall), 8px corners, panel background.
 *   - Header bar: action label (uppercase mono — gold for normal, carmine for
 *     destructive), Copy button, Docs ↗ link, close X.
 *   - Command line below in canvas-darker background.
 *   - Destructive variant adds a 1px carmine border to the panel.
 *
 * Interaction: portaled via the `@zeno/ui` `Dialog`, click outside / Escape
 * close (Radix wires both), `Copy` copies via `navigator.clipboard` and flips
 * the label to `COPIED` for 1.5s. The component is purely presentational —
 * no API calls.
 */

import { Dialog, DialogContent, DialogTitle } from '@zeno/ui';
import { type JSX, useEffect, useState } from 'react';
import { IcoX } from '@/components/icons';
import { buildCliCommand, type CommandKind } from '@/lib/build-cli-command';

const DOCS_BASE = 'https://docs.zeno-agent.dev/cli/connectors';
const COPIED_RESET_MS = 1500;

interface CommandModalProps {
  spec: CommandKind;
  onClose: () => void;
}

export function CommandModal({ spec, onClose }: CommandModalProps): JSX.Element {
  const { title, command, docsAnchor, destructive } = buildCliCommand(spec);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = (): void => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(command);
    }
    setCopied(true);
  };

  const handleOpenChange = (open: boolean): void => {
    if (!open) onClose();
  };

  const headerLabel = destructive ? `${title} · destructive` : title;
  const headerColor = destructive ? 'text-status-failed' : 'text-gold';
  // `cn` uses twMerge — these border classes override `DialogContent`'s
  // default `border border-border-subtle`. Same trick for rounded corners.
  const panelOverride = destructive
    ? 'rounded-lg border border-status-failed'
    : 'rounded-lg border border-border-strong';

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent aria-label={title} className={panelOverride}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2.5">
          <span
            className={`font-mono text-[11px] font-medium tracking-[0.08em] uppercase ${headerColor}`}
          >
            {headerLabel}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded border border-border-strong bg-panel-2 px-2.5 py-1 font-mono text-[10px] font-medium tracking-[0.08em] uppercase text-text-primary transition-colors duration-[120ms] hover:bg-panel"
            >
              {copied ? 'COPIED' : 'COPY'}
            </button>
            <a
              href={`${DOCS_BASE}#${docsAnchor}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-2 py-1 font-mono text-[10px] font-medium tracking-[0.08em] uppercase text-text-secondary transition-colors duration-[120ms] hover:text-text-primary"
            >
              DOCS ↗
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="close"
              className="inline-flex h-6 w-6 items-center justify-center text-text-tertiary transition-colors duration-[120ms] hover:text-text-primary"
            >
              <IcoX size={14} />
            </button>
          </div>
        </div>
        <div className="bg-canvas px-[18px] py-3.5">
          <pre className="m-0 whitespace-pre-wrap break-all font-mono text-[13px] leading-[1.4] text-text-primary">
            {`$ ${command}`}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}
