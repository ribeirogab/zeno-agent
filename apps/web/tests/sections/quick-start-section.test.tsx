import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { INSTALL_CMD } from '../../src/lib/constants';
import { QuickStartSection } from '../../src/sections/quick-start-section';

describe('<QuickStartSection />', () => {
  it('renders the heading and the install command verbatim inside <code>', () => {
    const { container } = render(<QuickStartSection />);
    expect(screen.getByText(/quick start/i)).toBeInTheDocument();
    const codes = container.querySelectorAll('code');
    const install = Array.from(codes).find((c) => c.textContent === INSTALL_CMD);
    expect(install).toBeDefined();
  });

  it('renders the one-liner tab', () => {
    render(<QuickStartSection />);
    expect(screen.getByText('one-liner')).toBeInTheDocument();
  });
});
