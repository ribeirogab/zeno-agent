type TerminalBlockProps = {
  tab: string;
  meta?: string;
  comment: string;
  command: string;
};

const dotStyle: React.CSSProperties = {
  width: '12px',
  height: '12px',
  borderRadius: '9999px',
  backgroundColor: 'var(--color-border-strong)',
};

// macOS-style terminal panel with a single tab + comment line + prompt.
// Used in <QuickStartSection> as the install moment.
export function TerminalBlock({ tab, meta, comment, command }: TerminalBlockProps) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: '1040px',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--color-panel)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: '6px',
        overflow: 'hidden',
        boxShadow:
          '0 0 0 1px rgba(217, 179, 98, 0.15), 0 18px 40px rgba(0, 0, 0, 0.4), 0 0 60px rgba(217, 179, 98, 0.04)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-border-subtle)',
          backgroundColor: 'var(--color-sidebar)',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <span style={dotStyle} />
          <span style={dotStyle} />
          <span style={dotStyle} />
        </div>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px 10px',
            borderRadius: '4px',
            backgroundColor: 'var(--color-gold)',
            color: 'var(--color-text-ink)',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.04em',
          }}
        >
          {tab}
        </span>
        {meta ? (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--color-text-tertiary)',
            }}
          >
            {meta}
          </span>
        ) : null}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          padding: '20px 24px',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--color-text-tertiary)',
          }}
        >
          {comment}
        </span>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'baseline' }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '14px',
              color: 'var(--color-gold)',
              fontWeight: 600,
            }}
          >
            $
          </span>
          <code
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '14px',
              color: 'var(--color-text-primary)',
              lineHeight: '22px',
            }}
          >
            {command}
          </code>
        </div>
      </div>
    </div>
  );
}
