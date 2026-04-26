import type { ReactNode } from 'react';

export type ToastTone = 'success' | 'warn' | 'fail';

export type Toast = {
  id: number;
  tone: ToastTone;
  message: ReactNode;
  action?: { label: string; onClick?: () => void };
  durationMs: number;
};

export type ToastInput = Omit<Toast, 'id' | 'durationMs'> & { durationMs?: number };

export type ToastContextValue = {
  toasts: Toast[];
  push: (input: ToastInput) => number;
  dismiss: (id: number) => void;
};
