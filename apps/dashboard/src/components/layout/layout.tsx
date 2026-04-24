import { type JSX, type ReactNode } from 'react';
import { Sidebar } from '@/components/layout/sidebar';

export function Layout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="grid min-h-screen grid-cols-[252px_1fr]">
      <Sidebar />
      <main className="relative z-[1] overflow-auto">{children}</main>
    </div>
  );
}
