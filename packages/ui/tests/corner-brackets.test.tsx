import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CornerBrackets } from '../src/index.js';

describe('CornerBrackets', () => {
  it('renders 4 span elements', () => {
    const { container } = render(
      <div>
        <CornerBrackets />
      </div>,
    );
    const spans = container.querySelectorAll('span');
    expect(spans.length).toBe(4);
  });

  it('each span has border-gold class', () => {
    const { container } = render(
      <div>
        <CornerBrackets />
      </div>,
    );
    const spans = container.querySelectorAll('span');
    for (const span of spans) {
      expect(span.className).toContain('border-gold');
    }
  });

  it('each span is absolutely positioned', () => {
    const { container } = render(
      <div>
        <CornerBrackets />
      </div>,
    );
    const spans = container.querySelectorAll('span');
    for (const span of spans) {
      expect(span.className).toContain('absolute');
    }
  });

  it('has pointer-events-none on all spans', () => {
    const { container } = render(
      <div>
        <CornerBrackets />
      </div>,
    );
    const spans = container.querySelectorAll('span');
    for (const span of spans) {
      expect(span.className).toContain('pointer-events-none');
    }
  });
});
