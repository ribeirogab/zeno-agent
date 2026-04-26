import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/toast/toast-provider';
import { useToast } from '../../src/components/toast/use-toast';

function Trigger() {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        toast.success('first');
        toast.warn('second');
        toast.fail('third');
      }}
    >
      fire
    </button>
  );
}

describe('<Toaster>', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when queue is empty', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    expect(screen.queryAllByRole('status').length).toBe(0);
  });

  it('renders all queued toasts in order, removes after auto-dismiss', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    act(() => {
      screen.getByRole('button', { name: 'fire' }).click();
    });
    const rows = screen.getAllByRole('status');
    expect(rows.length).toBe(3);
    expect(rows[0]?.textContent).toContain('first');
    expect(rows[1]?.textContent).toContain('second');
    expect(rows[2]?.textContent).toContain('third');

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryAllByRole('status').length).toBe(0);
  });

  it('positions stack fixed top-right z-50', () => {
    const { container } = render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    act(() => {
      screen.getByRole('button', { name: 'fire' }).click();
    });
    const stack = container.querySelector('[role="status"]')?.parentElement;
    expect(stack).not.toBeNull();
    expect(stack?.className).toContain('fixed');
    expect(stack?.className).toContain('top-6');
    expect(stack?.className).toContain('right-6');
    expect(stack?.className).toContain('z-50');
  });
});
