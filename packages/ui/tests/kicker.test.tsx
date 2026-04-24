import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Kicker } from '../src/index.js';

describe('Kicker', () => {
  it('renders children text', () => {
    render(<Kicker>section title</Kicker>);
    expect(screen.getByText('section title')).toBeDefined();
  });

  it('applies gold color by default', () => {
    const { container } = render(<Kicker>label</Kicker>);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('text-gold');
  });

  it('applies tertiary color when mute is true', () => {
    const { container } = render(<Kicker mute>label</Kicker>);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('text-text-tertiary');
    expect(span.className).not.toContain('text-gold');
  });

  it('uses uppercase mono font', () => {
    const { container } = render(<Kicker>label</Kicker>);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('uppercase');
    expect(span.className).toContain('font-mono');
  });
});
