'use client';

import { useEffect, useId, useRef, useState } from 'react';

/**
 * Mermaid diagram renderer. The `fumadocs-core/mdx-plugins` `remarkMdxMermaid`
 * plugin rewrites ```mermaid fences into `<Mermaid chart="..." />` MDX
 * elements; this component is the runtime renderer for those elements.
 *
 * `mermaid` is large (~600KB minified) and only needed when an MDX page
 * actually contains a diagram, so we dynamic-import it inside an effect —
 * pages without diagrams stay free of the dep at the network layer too.
 */
export function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, '-');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('mermaid');
        const mermaid = mod.default;
        mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
        const { svg } = await mermaid.render(`mermaid-${id}`, chart);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
        }
      } catch (renderError) {
        if (!cancelled) {
          setError((renderError as Error).message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (error) {
    return <pre style={{ color: 'var(--color-fd-error)' }}>Mermaid render error: {error}</pre>;
  }

  return <div ref={ref} className="my-4 flex justify-center" />;
}
