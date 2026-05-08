import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandModal } from '@/components/command-modal';

afterEach(() => cleanup());

describe('<CommandModal>', () => {
  it('renders the install command for catalog + label', () => {
    render(
      <CommandModal
        spec={{ kind: 'install', catalogId: 'linear', label: 'Acme' }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/zeno connector install linear --label "Acme"/)).toBeDefined();
  });

  it('marks destructive uninstall variant', () => {
    const onClose = vi.fn();
    render(<CommandModal spec={{ kind: 'uninstall', slug: 'linear-acme' }} onClose={onClose} />);
    expect(screen.getByText(/destructive/i)).toBeDefined();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<CommandModal spec={{ kind: 'test', slug: 'sentry' }} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('close'));
    expect(onClose).toHaveBeenCalled();
  });
});
