// Segmented OS selector for the install terminal. Today only macOS &
// Linux is wired (the install.sh is POSIX); Windows ships as a disabled
// pill with a lock + "Coming soon" tooltip so visitors see it on the
// roadmap without being able to break their install.
export function OsToggle() {
  return (
    <fieldset
      aria-label="Operating system"
      style={{
        display: 'inline-flex',
        alignItems: 'stretch',
        border: '1px solid var(--color-border-strong)',
        borderRadius: '4px',
        overflow: 'hidden',
        margin: 0,
        padding: 0,
      }}
    >
      <button
        type="button"
        aria-pressed="true"
        data-active=""
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          backgroundColor: 'var(--color-gold)',
          color: 'var(--color-text-ink)',
          border: 'none',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.04em',
          cursor: 'default',
        }}
      >
        macOS &amp; Linux
      </button>
      <button
        type="button"
        aria-pressed="false"
        aria-disabled="true"
        title="Coming soon"
        data-os-disabled=""
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          backgroundColor: 'transparent',
          color: 'var(--color-text-tertiary)',
          border: 'none',
          borderLeft: '1px solid var(--color-border-strong)',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          fontWeight: 500,
          letterSpacing: '0.04em',
          cursor: 'not-allowed',
        }}
        onClick={(event) => event.preventDefault()}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        Windows
      </button>
    </fieldset>
  );
}
