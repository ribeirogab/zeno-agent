import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeroSection } from '../../src/sections/hero-section';

describe('<HeroSection />', () => {
  it('renders the Zeno crest, the Zeno wordmark, and the kicker tagline', () => {
    render(<HeroSection />);
    expect(screen.getByLabelText(/Zeno crest/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Zeno' })).toBeInTheDocument();
    expect(screen.getByText(/personal agent that gets the work done/i)).toBeInTheDocument();
  });

  it('renders 40 elements with data-particle="true"', () => {
    const { container } = render(<HeroSection />);
    expect(container.querySelectorAll('[data-particle="true"]')).toHaveLength(40);
  });
});
