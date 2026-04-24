import type { JSX } from 'react';
import { Toaster as SonnerToaster } from 'sonner';

export function Toaster(): JSX.Element {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      toastOptions={{
        duration: 2400,
        style: {
          background: 'var(--color-panel)',
          border: '1px solid var(--color-border-subtle)',
          borderLeft: '2px solid var(--color-gold)',
          color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          boxShadow: 'var(--shadow-float)',
          borderRadius: '0',
        },
      }}
    />
  );
}
