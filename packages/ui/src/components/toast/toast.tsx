import { useEffect, useState } from 'react';
import type { ToastTone, Toast as ToastType } from './types';

const TONE_STYLES: Record<
  ToastTone,
  { border: string; borderL: string; dot: string; action: string }
> = {
  success: {
    border: 'border-status-active/30',
    borderL: 'border-l-2 border-l-status-active',
    dot: 'bg-status-active',
    action: 'text-status-active',
  },
  warn: {
    border: 'border-gold-line',
    borderL: 'border-l-2 border-l-gold',
    dot: 'bg-gold',
    action: 'text-gold',
  },
  fail: {
    border: 'border-status-failed/30',
    borderL: 'border-l-2 border-l-status-failed',
    dot: 'bg-status-failed',
    action: 'text-status-failed',
  },
};

export function Toast({ toast, onDismiss }: { toast: ToastType; onDismiss: () => void }) {
  const tone = TONE_STYLES[toast.tone];
  const [enter, setEnter] = useState(false);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setEnter(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-center gap-3 px-3.5 py-2.5 bg-canvas border ${tone.border} ${tone.borderL} transition-all duration-[180ms]`}
      style={{
        opacity: enter ? 1 : 0,
        transform: enter ? 'translateY(0)' : 'translateY(-6px)',
      }}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot}`} />
      <span className="flex-1 min-w-0 font-mono text-xs leading-4 text-text-primary">
        {toast.message}
      </span>
      {toast.action ? (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick?.();
            onDismiss();
          }}
          className={`shrink-0 font-mono text-[10px] tracking-[0.08em] leading-3 uppercase ${tone.action} hover:text-text-primary transition-colors duration-[120ms]`}
        >
          · {toast.action.label}
        </button>
      ) : (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary hover:text-text-primary transition-colors duration-[120ms]"
        >
          ×
        </button>
      )}
    </div>
  );
}
