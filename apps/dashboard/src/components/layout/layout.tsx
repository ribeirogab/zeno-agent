import { type JSX, type ReactNode, useState } from 'react';
import { MobileDrawer } from '@/components/layout/mobile-drawer';
import { Sidebar } from '@/components/layout/sidebar';

function MenuIcon({ size = 20 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <title>menu</title>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

export function Layout({ children }: { children: ReactNode }): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = (): void => setMenuOpen(false);

  return (
    <div className="flex min-h-screen flex-col bg-canvas md:h-screen md:flex-row md:overflow-hidden">
      <div className="hidden md:block">
        <Sidebar />
      </div>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border-subtle bg-sidebar px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <span className="font-serif text-xl italic leading-none text-gold">Z</span>
          <span className="text-sm tracking-wide text-text-primary">zeno</span>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open navigation"
          className="rounded-md p-1.5 text-text-secondary hover:bg-panel hover:text-text-primary"
        >
          <MenuIcon />
        </button>
      </header>

      <main className="flex-1 overflow-auto px-5 py-8 sm:px-8 md:px-16 md:py-14">{children}</main>

      <MobileDrawer open={menuOpen} onOpenChange={setMenuOpen}>
        <Sidebar onNavigate={closeMenu} />
      </MobileDrawer>
    </div>
  );
}
