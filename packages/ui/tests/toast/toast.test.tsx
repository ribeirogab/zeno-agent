import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Toast } from '../../src/components/toast/toast';
import type { Toast as ToastType } from '../../src/components/toast/types';

const baseToast: ToastType = {
  id: 1,
  tone: 'success',
  message: 'hello',
  durationMs: 4000,
};

describe('<Toast>', () => {
  it('renders message text', () => {
    render(<Toast toast={baseToast} onDismiss={() => {}} />);
    expect(screen.getByText('hello')).toBeTruthy();
  });

  it('applies success-tone classes on the bar', () => {
    const { container } = render(<Toast toast={baseToast} onDismiss={() => {}} />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('border-l-status-active');
  });

  it('applies warn-tone classes', () => {
    const { container } = render(
      <Toast toast={{ ...baseToast, tone: 'warn' }} onDismiss={() => {}} />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('border-l-gold');
  });

  it('applies fail-tone classes', () => {
    const { container } = render(
      <Toast toast={{ ...baseToast, tone: 'fail' }} onDismiss={() => {}} />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('border-l-status-failed');
  });

  it('fires onDismiss when × button clicked (no action)', async () => {
    const onDismiss = vi.fn();
    render(<Toast toast={baseToast} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('fires action.onClick AND onDismiss when action button clicked', async () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    render(
      <Toast
        toast={{ ...baseToast, action: { label: 'undo', onClick: onAction } }}
        onDismiss={onDismiss}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
