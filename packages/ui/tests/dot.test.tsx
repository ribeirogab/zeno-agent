import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dot } from '../src/index.js';

describe('Dot', () => {
  it('renders with default active tone', () => {
    const { container } = render(<Dot />);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('bg-status-active');
  });

  it('applies paused tone class', () => {
    const { container } = render(<Dot tone="paused" />);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('bg-status-paused');
  });

  it('applies failed tone class', () => {
    const { container } = render(<Dot tone="failed" />);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('bg-status-failed');
  });

  it('applies info tone class', () => {
    const { container } = render(<Dot tone="info" />);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('bg-status-info');
  });

  it('applies idle tone class', () => {
    const { container } = render(<Dot tone="idle" />);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('bg-text-tertiary');
  });

  it('does not include animation class by default', () => {
    const { container } = render(<Dot />);
    const span = container.firstChild as HTMLElement;
    expect(span.className).not.toContain('animate-pulse');
  });

  it('adds pulse animation class when pulse is true', () => {
    const { container } = render(<Dot pulse />);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('animate-pulse-jade');
  });

  it('uses tone-specific pulse class', () => {
    const { container } = render(<Dot tone="paused" pulse />);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('animate-pulse-gold');
  });

  it('renders as a rounded span', () => {
    const { container } = render(<Dot />);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('rounded-full');
  });
});
