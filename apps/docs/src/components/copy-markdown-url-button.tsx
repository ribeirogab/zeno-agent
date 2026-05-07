'use client';

import { Check, Link2, X } from 'lucide-react';
import { useState } from 'react';

type State = 'idle' | 'copied' | 'failed';

/**
 * Copies the absolute URL of the page's raw markdown endpoint to the clipboard.
 * Sits next to Fumadocs's `MarkdownCopyButton` (which copies the body) and
 * `ViewOptionsPopover` (which opens the markdown in ChatGPT/Claude/etc.) so the
 * page-actions row mirrors nuqs.dev: [Copy MD] [Copy MD URL] [Open ▾].
 */
export function CopyMarkdownUrlButton({ markdownUrl }: { markdownUrl: string }) {
  const [state, setState] = useState<State>('idle');

  async function handleClick() {
    try {
      const absolute =
        typeof window === 'undefined'
          ? markdownUrl
          : new URL(markdownUrl, window.location.origin).toString();
      await navigator.clipboard.writeText(absolute);
      setState('copied');
    } catch {
      setState('failed');
    } finally {
      setTimeout(() => setState('idle'), 2000);
    }
  }

  const Icon = state === 'copied' ? Check : state === 'failed' ? X : Link2;
  const label = state === 'copied' ? 'Copied' : state === 'failed' ? 'Failed' : 'Copy Markdown URL';

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex h-8 items-center gap-2 rounded-md border border-fd-border bg-fd-card px-3 text-sm text-fd-foreground transition-colors hover:bg-fd-accent"
    >
      <Icon size={14} aria-hidden />
      <span>{label}</span>
    </button>
  );
}
