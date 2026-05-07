import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BetaToggle } from '../../src/components/beta-toggle';

describe('<BetaToggle />', () => {
  it('renders aria-checked reflecting the active prop', () => {
    const { rerender } = render(<BetaToggle active={false} onChange={() => {}} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');

    rerender(<BetaToggle active={true} onChange={() => {}} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange with the negated value on click', () => {
    const handler = vi.fn();
    render(<BetaToggle active={false} onChange={handler} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(handler).toHaveBeenCalledWith(true);
  });
});
