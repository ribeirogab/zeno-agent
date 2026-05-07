import { TerminalBlock } from '../components/terminal-block';
import { INSTALL_CMD } from '../lib/constants';

// Quick Start. Heading kicker -> macOS-style terminal block with the
// install one-liner -> prereqs footnote. Section is the install moment;
// everything else on the page funnels here.
export function QuickStartSection() {
  return (
    <section
      aria-label="quick-start"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        padding: '32px 192px 64px',
        backgroundImage:
          'radial-gradient(ellipse 700px 320px at 50% 60%, rgba(217, 179, 98, 0.06) 0%, rgba(217, 179, 98, 0.02) 40%, rgba(8, 9, 15, 0) 80%)',
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 500,
          fontSize: '22px',
          lineHeight: '28px',
          color: 'var(--color-text-primary)',
          margin: 0,
        }}
      >
        <span style={{ color: 'var(--color-gold)' }}>›</span> Quick Start
      </h2>
      <TerminalBlock
        tab="one-liner"
        comment="# Clones to ~/zeno-agent and installs the `zeno` CLI to ~/.local/bin"
        command={INSTALL_CMD}
      />
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          lineHeight: '20px',
          color: 'var(--color-text-secondary)',
          margin: 0,
          maxWidth: '80ch',
        }}
      >
        Requires{' '}
        <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
          git
        </code>
        ,{' '}
        <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
          docker
        </code>
        , Node 24 LTS, pnpm 10, a Slack workspace where you can install a custom app, and a Claude
        account on a Pro or Max plan.
      </p>
    </section>
  );
}
