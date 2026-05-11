'use client';

import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import { useCopyButton } from 'fumadocs-ui/utils/use-copy-button';
import { Check, Link2 } from 'lucide-react';

/**
 * Copies the absolute URL of the page's raw markdown endpoint to the
 * clipboard. Visually identical to Fumadocs's `MarkdownCopyButton` (color,
 * size, gap, icon size, checked-state transition) — only the icon differs
 * (`Link2` instead of `Copy`). The three buttons in the page-actions row
 * (`[Copy Markdown] [Copy Markdown URL] [Open ▾]`) read as one consistent
 * control surface.
 */
export function CopyMarkdownUrlButton({ markdownUrl }: { markdownUrl: string }) {
  const [checked, onClick] = useCopyButton(async () => {
    const absolute =
      typeof window === 'undefined'
        ? markdownUrl
        : new URL(markdownUrl, window.location.origin).toString();
    await navigator.clipboard.writeText(absolute);
  });

  return (
    <button
      type="button"
      onClick={onClick}
      className={buttonVariants({
        color: 'secondary',
        size: 'sm',
        className: 'gap-2 [&_svg]:size-3.5 [&_svg]:text-fd-muted-foreground',
      })}
    >
      {checked ? <Check /> : <Link2 />}
      Copy Markdown URL
    </button>
  );
}
