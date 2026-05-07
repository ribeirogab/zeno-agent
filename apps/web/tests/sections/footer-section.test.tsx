import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GITHUB_URL, LICENSE_URL, ROADMAP_URL } from '../../src/lib/constants';
import { FooterSection } from '../../src/sections/footer-section';

describe('<FooterSection />', () => {
  it('renders three footer links targeting GitHub, Roadmap, License (in that order)', () => {
    const { container } = render(<FooterSection />);
    const links = Array.from(container.querySelectorAll('a'));
    expect(links).toHaveLength(3);
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      GITHUB_URL,
      ROADMAP_URL,
      LICENSE_URL,
    ]);
  });

  it('does not render the @ribeirogab handle', () => {
    render(<FooterSection />);
    expect(screen.queryByText(/@ribeirogab/)).toBeNull();
  });
});
