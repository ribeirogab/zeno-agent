import { useState } from 'react';
import { BetaToggle } from '../components/beta-toggle';
import { OsToggle } from '../components/os-toggle';
import { TerminalBlock } from '../components/terminal-block';
import { INSTALL_CMD, INSTALL_CMD_BETA } from '../lib/constants';

// Quick Start. Heading kicker -> macOS-style terminal block with the
// install one-liner -> prereqs footnote. Header carries an OS toggle
// (macOS & Linux active; Windows disabled with a "Coming soon" tooltip)
// and a BETA toggle that switches the rendered command to the
// `--beta` form (install.sh from main vs latest release tag).
//
// Section is the install moment; everything else on the page funnels
// here.
export function QuickStartSection() {
  const [beta, setBeta] = useState(false);
  const command = beta ? INSTALL_CMD_BETA : INSTALL_CMD;
  const comment = beta
    ? '# BETA — installs from `main`. May be broken; expect breaking changes.'
    : '# Clones to ~/zeno-agent and installs the `zeno` CLI to ~/.local/bin';

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
        comment={comment}
        command={command}
        headerRight={
          <>
            <OsToggle />
            <BetaToggle active={beta} onChange={setBeta} />
          </>
        }
      />
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          lineHeight: '20px',
          color: 'var(--color-text-secondary)',
          margin: 0,
        }}
      >
        Requires <code style={prereqCodeStyle}>git</code>,{' '}
        <code style={prereqCodeStyle}>docker</code>,{' '}
        <code style={prereqCodeStyle}>Node 24 LTS</code>,{' '}
        <code style={prereqCodeStyle}>pnpm 10</code>, a Slack workspace where you can install a
        custom app, and a Claude account on a Pro or Max plan.
      </p>
    </section>
  );
}

const prereqCodeStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  color: 'var(--color-text-primary)',
};
