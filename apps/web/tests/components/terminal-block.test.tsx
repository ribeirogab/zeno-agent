import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TerminalBlock } from '../../src/components/terminal-block';

describe('<TerminalBlock />', () => {
  it('renders the configured tab and meta strings', () => {
    render(
      <TerminalBlock
        tab="one-liner"
        meta="macOS · Linux · WSL2"
        comment="# example comment"
        command="echo ok"
      />,
    );
    expect(screen.getByText('one-liner')).toBeInTheDocument();
    expect(screen.getByText('macOS · Linux · WSL2')).toBeInTheDocument();
  });

  it('renders the command verbatim inside a <code>', () => {
    const cmd = 'curl -fsSL https://example.com/install.sh | sh';
    const { container } = render(<TerminalBlock tab="one-liner" comment="# x" command={cmd} />);
    const code = container.querySelector('code');
    expect(code?.textContent).toBe(cmd);
  });
});
