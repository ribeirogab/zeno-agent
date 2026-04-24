import type { JSX, ReactNode } from 'react';
import { Sidebar } from '@/components/layout/sidebar';

export function Layout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="relative grid min-h-screen grid-cols-[252px_1fr]">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: [
            'linear-gradient(to right, rgba(217,179,98,0.022) 1px, transparent 1px)',
            'linear-gradient(to bottom, rgba(217,179,98,0.022) 1px, transparent 1px)',
          ].join(', '),
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse at 50% 0%, black 20%, transparent 80%)',
        }}
      />
      <Sidebar />
      <main className="relative z-[1] overflow-auto">{children}</main>
    </div>
  );
}
