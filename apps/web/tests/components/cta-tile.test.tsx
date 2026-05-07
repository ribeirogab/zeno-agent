import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CTATile } from '../../src/components/cta-tile';

describe('<CTATile />', () => {
  it('renders an <a> with the configured href, title, and caption', () => {
    render(
      <CTATile
        href="https://example.com"
        icon={<svg data-testid="icon" />}
        title="Example"
        caption="A sample tile"
      />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(screen.getByText('Example')).toBeInTheDocument();
    expect(screen.getByText('A sample tile')).toBeInTheDocument();
  });
});
