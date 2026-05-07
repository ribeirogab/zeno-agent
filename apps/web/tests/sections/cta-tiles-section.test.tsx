import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DOCS_URL, GITHUB_URL, ROADMAP_URL } from '../../src/lib/constants';
import { CTATilesSection } from '../../src/sections/cta-tiles-section';

describe('<CTATilesSection />', () => {
  it('renders three tile links targeting GitHub, Docs, and Roadmap in order', () => {
    const { container } = render(<CTATilesSection />);
    const links = Array.from(container.querySelectorAll('a'));
    expect(links).toHaveLength(3);
    expect(links[0]?.getAttribute('href')).toBe(GITHUB_URL);
    expect(links[1]?.getAttribute('href')).toBe(DOCS_URL);
    expect(links[2]?.getAttribute('href')).toBe(ROADMAP_URL);
  });
});
