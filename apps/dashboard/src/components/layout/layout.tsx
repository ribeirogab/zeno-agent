import type { JSX, ReactNode } from 'react';
import { Sidebar } from '@/components/layout/sidebar';

export function Layout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 overflow-auto px-16 py-14">{children}</main>
    </div>
  );
}
