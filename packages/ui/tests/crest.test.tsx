import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Crest } from '../src/index.js';

describe('Crest', () => {
  it('renders an SVG element', () => {
    const { container } = render(<Crest />);
    const svg = container.querySelector('svg');
    expect(svg).toBeDefined();
    expect(svg).not.toBeNull();
  });

  it('uses default size of 28', () => {
    const { container } = render(<Crest />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('width')).toBe('28');
    expect(svg.getAttribute('height')).toBe('28');
  });

  it('respects custom size prop', () => {
    const { container } = render(<Crest size={48} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('width')).toBe('48');
    expect(svg.getAttribute('height')).toBe('48');
  });

  it('renders 2 diamond paths by default', () => {
    const { container } = render(<Crest />);
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBe(2);
  });

  it('renders 3 diamond paths when ornate is true', () => {
    const { container } = render(<Crest ornate />);
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBe(3);
  });

  it('is aria-hidden', () => {
    const { container } = render(<Crest />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });
});
