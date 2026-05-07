import { GoldRule } from '../components/gold-rule';

// EXPERIMENTAL warning rule. Sits between hero and Quick Start; its job
// is to tell the visitor what they are about to install before they read
// the curl command. Single line, gold left rule, no apology.
export function WarningSection() {
  return (
    <section
      aria-label="experimental"
      style={{
        display: 'flex',
        padding: '32px 192px 0',
      }}
    >
      <GoldRule>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--color-gold)',
            flexShrink: 0,
          }}
        >
          Experimental
        </span>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            lineHeight: '22px',
            color: 'var(--color-text-secondary)',
            margin: 0,
          }}
        >
          Single-user, no SLA, breaking changes between commits. Personal project run locally — no
          support, no migration path, no guarantees.
        </p>
      </GoldRule>
    </section>
  );
}
