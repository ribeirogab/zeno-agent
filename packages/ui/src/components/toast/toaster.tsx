import { useContext } from 'react';
import { Toast } from './toast';
import { ToastContext } from './toast-context';

/**
 * Renders the active toast queue from <ToastProvider>'s context.
 * Mounted automatically by <ToastProvider>; rarely needed standalone.
 */
export function Toaster() {
  const ctx = useContext(ToastContext);
  if (!ctx || ctx.toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed top-6 right-6 z-50 flex flex-col gap-2 w-[420px] max-w-[90vw]">
      {ctx.toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={() => ctx.dismiss(t.id)} />
      ))}
    </div>
  );
}
