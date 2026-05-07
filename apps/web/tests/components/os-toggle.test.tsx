import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OsToggle } from '../../src/components/os-toggle';

describe('<OsToggle />', () => {
  it('marks Windows as disabled with a "Coming soon" tooltip', () => {
    render(<OsToggle />);
    const windowsBtn = screen.getByRole('button', { name: /windows/i });
    expect(windowsBtn).toHaveAttribute('aria-disabled', 'true');
    expect(windowsBtn).toHaveAttribute('title', 'Coming soon');
  });

  it('renders macOS & Linux as the active option', () => {
    render(<OsToggle />);
    const macBtn = screen.getByRole('button', { name: /macOS & Linux/i });
    expect(macBtn).toHaveAttribute('aria-pressed', 'true');
  });
});
