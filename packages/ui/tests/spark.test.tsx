import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Spark } from '../src/index.js';

describe('Spark', () => {
  it('renders an SVG element', () => {
    const { container } = render(<Spark data={[1, 2, 3]} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('renders a polyline with correct number of points', () => {
    const data = [10, 20, 30, 40, 50];
    const { container } = render(<Spark data={data} />);
    const polyline = container.querySelector('polyline');
    expect(polyline).not.toBeNull();
    const points = polyline!.getAttribute('points')!;
    const pointPairs = points.split(' ');
    expect(pointPairs.length).toBe(data.length);
  });

  it('uses default dimensions', () => {
    const { container } = render(<Spark data={[1, 2]} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('width')).toBe('60');
    expect(svg.getAttribute('height')).toBe('18');
  });

  it('respects custom width and height', () => {
    const { container } = render(<Spark data={[1, 2]} width={100} height={30} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('width')).toBe('100');
    expect(svg.getAttribute('height')).toBe('30');
  });

  it('is aria-hidden', () => {
    const { container } = render(<Spark data={[1, 2, 3]} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });
});
