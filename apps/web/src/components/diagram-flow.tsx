import { Fragment } from 'react';
import { DiagramNode } from './diagram-node';

type Node = {
  kicker: string;
  name: string;
  caption: string;
  highlighted?: boolean;
};

type DiagramFlowProps = {
  nodes: readonly Node[];
};

// Renders a row of <DiagramNode> with mono "→" glyphs between them.
// The container itself has a panel background + subtle border so the
// diagram reads as a single unit on the page.
export function DiagramFlow({ nodes }: DiagramFlowProps) {
  return (
    <div
      data-diagram-flow=""
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: '12px',
        padding: '32px',
        border: '1px solid var(--color-border-subtle)',
        backgroundColor: 'var(--color-panel)',
        borderRadius: '6px',
      }}
    >
      {nodes.map((node, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: nodes are static and never reordered
        <Fragment key={`${node.name}-${index}`}>
          <DiagramNode {...node} />
          {index < nodes.length - 1 ? (
            <span
              aria-hidden="true"
              data-diagram-arrow=""
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: '18px',
                color: 'var(--color-text-tertiary)',
                padding: '0 4px',
              }}
            >
              →
            </span>
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}
