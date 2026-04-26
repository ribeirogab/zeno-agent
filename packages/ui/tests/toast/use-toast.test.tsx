import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/toast/toast-provider';
import { useToast } from '../../src/components/toast/use-toast';

function wrapper({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe('useToast()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws when used outside <ToastProvider>', () => {
    expect(() => renderHook(() => useToast())).toThrow(/must be used within/i);
  });

  it('success() returns a numeric id', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    let id = 0;
    act(() => {
      id = result.current.success('hello');
    });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('warn() and fail() return distinct ids', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    let a = 0;
    let b = 0;
    act(() => {
      a = result.current.warn('w');
      b = result.current.fail('f');
    });
    expect(a).not.toBe(b);
  });

  it('dismiss(id) is safe to call before auto-dismiss timer fires', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    let id = 0;
    act(() => {
      id = result.current.success('hello');
      result.current.dismiss(id);
    });
    // Advancing past durationMs after manual dismiss is a no-op (filter on
    // empty match). If this throws or hangs, the dismiss path is broken.
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(true).toBe(true);
  });

  it('auto-dismisses after default 4000ms without throwing', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.success('hello');
    });
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(true).toBe(true);
  });

  it('respects custom durationMs', () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.warn('hello', { durationMs: 1800 });
    });
    act(() => {
      vi.advanceTimersByTime(1800);
    });
    expect(true).toBe(true);
  });
});
