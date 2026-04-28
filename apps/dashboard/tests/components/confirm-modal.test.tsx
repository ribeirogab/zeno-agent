import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmModal } from '@/components/shared/confirm-modal';

afterEach(() => cleanup());

describe('<ConfirmModal>', () => {
  it('renders title + default kicker for neutral intent', () => {
    render(
      <ConfirmModal
        title="Refresh tools?"
        confirmLabel="apply"
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('Refresh tools?')).toBeDefined();
    expect(screen.getByText('confirm')).toBeDefined();
  });

  it('renders destructive kicker when intent="destructive"', () => {
    render(
      <ConfirmModal
        title="Uninstall?"
        intent="destructive"
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('destructive · confirm')).toBeDefined();
  });

  it('confirm button is enabled by default (no type-to-confirm)', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        title="Refresh tools?"
        confirmLabel="refresh tools"
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );
    const cta = screen.getByText('refresh tools') as HTMLButtonElement;
    expect(cta.disabled).toBe(false);
    fireEvent.click(cta);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancel button calls onClose', () => {
    const onClose = vi.fn();
    render(<ConfirmModal title="Uninstall?" onConfirm={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByText('cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables confirm CTA until requireTypeToConfirm matches', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        title="Uninstall Linear?"
        confirmLabel="uninstall"
        intent="destructive"
        requireTypeToConfirm="Linear"
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );
    const cta = screen.getByText('uninstall') as HTMLButtonElement;
    expect(cta.disabled).toBe(true);

    fireEvent.click(cta);
    expect(onConfirm).not.toHaveBeenCalled();

    const input = document.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Linear' } });
    expect(cta.disabled).toBe(false);

    fireEvent.click(cta);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does NOT render the type-to-confirm input when requireTypeToConfirm is omitted', () => {
    render(<ConfirmModal title="Refresh tools?" onConfirm={() => {}} onClose={() => {}} />);
    expect(document.querySelector('input')).toBeNull();
  });
});
