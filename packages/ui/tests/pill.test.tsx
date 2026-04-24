import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OutlinePill, Pill } from '../src/index.js';

describe('Pill', () => {
  it('renders children text', () => {
    render(<Pill>active</Pill>);
    expect(screen.getByText('active')).toBeDefined();
  });

  it('applies active tone styles by default', () => {
    const { container } = render(<Pill>test</Pill>);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('text-status-active');
  });

  it('applies failed tone styles', () => {
    const { container } = render(<Pill tone="failed">error</Pill>);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('text-status-failed');
  });

  it('applies paused tone styles', () => {
    const { container } = render(<Pill tone="paused">wait</Pill>);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('text-status-paused');
  });

  it('contains a Dot child element', () => {
    const { container } = render(<Pill>test</Pill>);
    const dot = container.querySelector('.rounded-full');
    expect(dot).not.toBeNull();
  });

  it('renders with border class', () => {
    const { container } = render(<Pill>test</Pill>);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('border');
  });
});

describe('OutlinePill', () => {
  it('renders children text', () => {
    render(<OutlinePill>label</OutlinePill>);
    expect(screen.getByText('label')).toBeDefined();
  });

  it('renders with border styling', () => {
    const { container } = render(<OutlinePill>label</OutlinePill>);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('border');
    expect(span.className).toContain('border-border-subtle');
  });

  it('uses tertiary text color', () => {
    const { container } = render(<OutlinePill>label</OutlinePill>);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain('text-text-tertiary');
  });
});
