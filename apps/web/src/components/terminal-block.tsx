import { type ReactNode, useCallback, useState } from 'react';

type TerminalBlockProps = {
  tab: string;
  meta?: string;
  comment: string;
  command: string;
  // Optional slot rendered between the meta string and the copy button.
  // Used to embed segmented controls (OS toggle, BETA toggle, etc.).
  headerRight?: ReactNode;
};

const dotStyle: React.CSSProperties = {
  width: '12px',
  height: '12px',
  borderRadius: '9999px',
  backgroundColor: 'var(--color-border-strong)',
};

// macOS-style terminal panel with a single tab + comment line + prompt.
// The header carries an optional meta string and a copy button that
// writes `command` to the clipboard (graceful no-op when the API is
// missing). Used in <QuickStartSection> as the install moment.
export function TerminalBlock({ tab, meta, comment, command, headerRight }: TerminalBlockProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(command).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      },
      () => {
        // Clipboard write rejected (insecure context, permission, etc.).
        // Stay silent — the visible command is still copyable manually.
      },
    );
  }, [command]);

  return (
    <div
      style={{
        width: '100%',
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
        data-terminal-header=""
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
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
        {headerRight ? (
          <div
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {headerRight}
          </div>
        ) : null}
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy install command to clipboard"
          data-terminal-copy=""
          style={{
            marginLeft: headerRight ? '8px' : 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            border: '1px solid var(--color-border-strong)',
            backgroundColor: 'transparent',
            color: copied ? 'var(--color-gold)' : 'var(--color-text-secondary)',
            borderRadius: '4px',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 500,
            letterSpacing: '0.04em',
            cursor: 'pointer',
          }}
        >
          {copied ? (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <div
        data-terminal-body=""
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          padding: '20px 24px',
          overflowX: 'auto',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--color-text-tertiary)',
            whiteSpace: 'nowrap',
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
              whiteSpace: 'nowrap',
            }}
          >
            {command}
          </code>
        </div>
      </div>
    </div>
  );
}
