import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { JSX, ReactNode } from 'react';
import { cn } from '../utils';

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  side?: 'left' | 'right';
  className?: string;
  title?: string;
  description?: string;
}

/**
 * Side-slide drawer built on @radix-ui/react-dialog.
 *
 * Differs from `Dialog` in positioning: slides from a side edge instead of
 * appearing centered. Intended for mobile navigation drawers.
 */
export function Drawer({
  open,
  onOpenChange,
  children,
  side = 'left',
  className,
  title = 'Navigation',
  description = 'Navigation drawer',
}: DrawerProps): JSX.Element {
  const sideClasses =
    side === 'left' ? 'left-0 top-0 h-full border-r' : 'right-0 top-0 h-full border-l';
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className={cn(
            'fixed z-50 flex w-[260px] max-w-[80vw] flex-col border-border-subtle bg-sidebar shadow-lg focus:outline-none',
            sideClasses,
            className,
          )}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {description}
          </DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
