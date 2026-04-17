import { Drawer } from '@zeno/ui';
import type { JSX, ReactNode } from 'react';

export interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function MobileDrawer({ open, onOpenChange, children }: MobileDrawerProps): JSX.Element {
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      side="left"
      title="Zeno navigation"
      description="Dashboard navigation drawer — tap a link to navigate or tap outside to close."
    >
      {children}
    </Drawer>
  );
}
