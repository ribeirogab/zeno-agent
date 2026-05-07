import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WarningSection } from '../../src/sections/warning-section';

describe('<WarningSection />', () => {
  it('renders the EXPERIMENTAL label and the body text', () => {
    render(<WarningSection />);
    expect(screen.getByText(/experimental/i)).toBeInTheDocument();
    expect(screen.getByText(/single-user/i)).toBeInTheDocument();
  });
});
