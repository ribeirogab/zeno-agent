import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Chip } from '../src/index.js';

describe('Chip', () => {
  it('renders children text', () => {
    render(<Chip>filter</Chip>);
    expect(screen.getByText('filter')).toBeDefined();
  });

  it('renders as a button element', () => {
    render(<Chip>filter</Chip>);
    expect(screen.getByRole('button', { name: 'filter' })).toBeDefined();
  });

  it('applies inactive styling by default', () => {
    render(<Chip>filter</Chip>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-transparent');
    expect(btn.className).toContain('border-border-subtle');
  });

  it('applies active styling when active is true', () => {
    render(<Chip active>filter</Chip>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('border-gold');
    expect(btn.className).toContain('bg-gold-soft');
    expect(btn.className).toContain('text-gold');
  });

  it('fires onClick callback', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    render(<Chip onClick={handleClick}>filter</Chip>);
    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not throw when clicked without onClick', async () => {
    const user = userEvent.setup();
    render(<Chip>filter</Chip>);
    await user.click(screen.getByRole('button'));
  });
});
