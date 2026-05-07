type DiagramNodeProps = {
  kicker: string;
  name: string;
  caption: string;
  highlighted?: boolean;
};

// Single node in the connector-model diagram. Highlighted nodes get a
// gold border + soft halo (used for "Agent · Claude" — the project's
// brain). Unhighlighted nodes get a subtle gold top-edge inset shadow.
export function DiagramNode({ kicker, name, caption, highlighted = false }: DiagramNodeProps) {
  return (
    <div
      data-highlighted={highlighted ? 'true' : undefined}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '18px',
        border: highlighted
          ? '1px solid var(--color-gold)'
          : '1px solid var(--color-border-strong)',
        backgroundColor: 'var(--color-panel-2)',
        borderRadius: '4px',
        boxShadow: highlighted
          ? '0 0 0 1px rgba(217, 179, 98, 0.5), 0 0 24px rgba(217, 179, 98, 0.18)'
          : 'inset 0 1px 0 rgba(217, 179, 98, 0.18)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          fontWeight: 600,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--color-gold)',
        }}
      >
        {kicker}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
        }}
      >
        {name}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '12px',
          lineHeight: '18px',
          color: 'var(--color-text-secondary)',
        }}
      >
        {caption}
      </span>
    </div>
  );
}
