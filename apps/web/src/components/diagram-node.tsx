type DiagramNodeProps = {
  kicker: string;
  name: string;
  caption: string;
  highlighted?: boolean;
};

// Single node in the connector-model diagram. Cards sit on canvas
// inside a panel envelope (DiagramFlow draws the panel) — this gives
// the layered, two-tone look that matches the install terminal.
// Highlighted nodes get a gold border + soft halo (the agent slot —
// today Claude, tomorrow whatever multi-backend ships).
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
          : '1px solid var(--color-border-subtle)',
        backgroundColor: 'var(--color-canvas)',
        borderRadius: '4px',
        boxShadow: highlighted ? '0 0 24px rgba(217, 179, 98, 0.18)' : 'none',
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
          fontSize: '16px',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
        }}
      >
        {name}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          lineHeight: '20px',
          color: 'var(--color-text-secondary)',
        }}
      >
        {caption}
      </span>
    </div>
  );
}
