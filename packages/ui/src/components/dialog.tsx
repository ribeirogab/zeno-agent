import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ComponentPropsWithoutRef, ElementRef, JSX, ReactNode } from 'react';
import { forwardRef } from 'react';
import { cn } from '../utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn('fixed inset-0 z-40 bg-overlay animate-[fade-in_200ms_ease-out]', className)}
      {...props}
    />
  );
});

export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { children: ReactNode; width?: string }
>(function DialogContent({ className, children, width, ...props }, ref) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-48px)] -translate-x-1/2 -translate-y-1/2 overflow-auto border border-border-subtle bg-panel shadow-float animate-[dialog-in_240ms_ease-out]',
          width ?? 'w-[560px] max-w-[calc(100vw-48px)]',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});

export function DialogHeader({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-7 pb-3.5 pt-5.5">
      {children}
    </div>
  );
}

export const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn(
        'font-serif text-[22px] font-normal tracking-[-0.015em] text-text-primary',
        className,
      )}
      {...props}
    />
  );
});

export function DialogSubtitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <span
      className={cn(
        'mt-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-gold',
        className,
      )}
    >
      {children}
    </span>
  );
}

export const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-sm text-text-secondary', className)}
      {...props}
    />
  );
});

export function DialogBody({ children }: { children: ReactNode }): JSX.Element {
  return <div className="flex flex-col gap-4.5 px-7 py-5.5">{children}</div>;
}

export function DialogFooter({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex justify-end gap-2.5 border-t border-border-subtle bg-sidebar px-7 py-4">
      {children}
    </div>
  );
}
