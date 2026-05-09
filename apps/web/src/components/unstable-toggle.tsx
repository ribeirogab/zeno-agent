type UnstableToggleProps = {
  active: boolean;
  onChange: (next: boolean) => void;
};

// "Unstable" channel toggle. When active, the install command switches to the
// `--unstable` form which fetches install.sh from `main` instead of from the
// latest release tag. The toggle itself is purely presentational — the parent
// owns the state and rebuilds the displayed command.
export function UnstableToggle({ active, onChange }: UnstableToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label="Install from main branch (no CI gate; may break)"
      title={
        active ? 'Switch to stable release' : 'Install from main branch (no CI gate; may break)'
      }
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
        transition:
          'color 280ms cubic-bezier(0.4, 0, 0.2, 1), border-color 280ms cubic-bezier(0.4, 0, 0.2, 1), background-color 280ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      UNSTABLE
    </button>
  );
}
