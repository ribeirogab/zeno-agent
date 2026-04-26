import { useCallback, useState } from 'react';
import { ToastContext } from './toast-context';
import { Toaster } from './toaster';
import type { Toast, ToastInput } from './types';

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = nextId++;
      const toast: Toast = {
        id,
        tone: input.tone,
        message: input.message,
        durationMs: input.durationMs ?? 4000,
        ...(input.action ? { action: input.action } : {}),
      };
      setToasts((prev) => [...prev, toast]);
      window.setTimeout(() => dismiss(id), toast.durationMs);
      return id;
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toasts, push, dismiss }}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  );
}
