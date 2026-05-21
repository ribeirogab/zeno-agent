import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ViewToggle } from './view-toggle';

describe('ViewToggle', () => {
  it('renders both buttons with the active one marked aria-pressed', () => {
    render(<ViewToggle value="tree" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /tree/i }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /graph/i }).getAttribute('aria-pressed')).toBe('false');
  });

  it('calls onChange when the inactive option is clicked', async () => {
    const onChange = vi.fn();
    render(<ViewToggle value="tree" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /graph/i }));
    expect(onChange).toHaveBeenCalledWith('graph');
  });

  it('does not fire onChange when the active option is re-clicked', async () => {
    const onChange = vi.fn();
    render(<ViewToggle value="graph" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /graph/i }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
