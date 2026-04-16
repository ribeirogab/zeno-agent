import type { JSX } from 'react';
import { Toaster as SonnerToaster } from 'sonner';

export function Toaster(): JSX.Element {
  return (
    <SonnerToaster
      theme="dark"
      position="top-right"
      toastOptions={{
        style: {
          background: 'var(--color-panel)',
          border: '1px solid var(--color-border-subtle)',
          color: 'var(--color-text-primary)',
        },
      }}
    />
  );
}
