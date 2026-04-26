import type { ReactNode } from 'react';
import { useContext } from 'react';
import { ToastContext } from './toast-context';
import type { ToastInput } from './types';

/**
 * Hook returning success/warn/fail/dismiss helpers. Must be called
 * inside a <ToastProvider>.
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return {
    success: (message: ReactNode, opts?: Partial<ToastInput>) =>
      ctx.push({ tone: 'success', message, ...opts }),
    warn: (message: ReactNode, opts?: Partial<ToastInput>) =>
      ctx.push({ tone: 'warn', message, ...opts }),
    fail: (message: ReactNode, opts?: Partial<ToastInput>) =>
      ctx.push({ tone: 'fail', message, ...opts }),
    dismiss: ctx.dismiss,
  };
}
