type BetaToggleProps = {
  active: boolean;
  onChange: (next: boolean) => void;
};

// β BETA toggle. When active, the install command switches to the
// `--beta` form which fetches install.sh from `main` instead of from
// the latest release tag. The toggle itself is purely presentational —
// the parent owns the state and rebuilds the displayed command.
export function BetaToggle({ active, onChange }: BetaToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label="Install from main branch (cutting edge)"
      title={active ? 'Switch to stable release' : 'Install from main branch (cutting edge)'}
      data-active={active ? '' : undefined}
      onClick={() => onChange(!active)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        border: active ? '1px solid var(--color-gold)' : '1px solid var(--color-border-strong)',
        borderRadius: '4px',
        backgroundColor: active ? 'rgba(217, 179, 98, 0.12)' : 'transparent',
        color: active ? 'var(--color-gold)' : 'var(--color-text-secondary)',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.04em',
        cursor: 'pointer',
      }}
    >
      <span aria-hidden="true" style={{ fontStyle: 'italic' }}>
        β
      </span>
      BETA
    </button>
  );
}
