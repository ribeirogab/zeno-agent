import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app';

const EXPECTED_LABELS = [
  'hero',
  'experimental',
  'quick-start',
  'how-it-works',
  'cta',
  'footer',
] as const;

describe('<App />', () => {
  it('renders without throwing', () => {
    expect(() => render(<App />)).not.toThrow();
  });

  it('renders six top-level region landmarks in declared order', () => {
    const { container } = render(<App />);
    const landmarks = Array.from(container.querySelectorAll('[aria-label]')).filter(
      (el) => el.tagName === 'SECTION' || el.tagName === 'FOOTER',
    );
    const labels = landmarks.map((el) => el.getAttribute('aria-label'));
    expect(labels).toEqual([...EXPECTED_LABELS]);
  });

  it('renders the Zeno wordmark in the hero', () => {
    const { container } = render(<App />);
    const heading = container.querySelector('h1');
    expect(heading?.textContent).toBe('Zeno');
  });
});
