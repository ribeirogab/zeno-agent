import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Losango } from '../src/index.js';

describe('Losango', () => {
  it('renders an SVG element', () => {
    const { container } = render(<Losango />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('uses default size of 5 producing 10x10 svg', () => {
    const { container } = render(<Losango />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('width')).toBe('10');
    expect(svg.getAttribute('height')).toBe('10');
  });

  it('respects custom size prop', () => {
    const { container } = render(<Losango size={8} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('width')).toBe('16');
    expect(svg.getAttribute('height')).toBe('16');
  });

  it('renders a diamond path', () => {
    const { container } = render(<Losango />);
    const path = container.querySelector('path');
    expect(path).not.toBeNull();
    expect(path!.getAttribute('d')).toContain('M5 0');
  });

  it('is aria-hidden', () => {
    const { container } = render(<Losango />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });
});
