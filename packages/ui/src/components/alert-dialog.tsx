import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import type { ComponentPropsWithoutRef, ElementRef, JSX, ReactNode } from 'react';
import { forwardRef } from 'react';
import { cn } from '../utils';

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogPortal = AlertDialogPrimitive.Portal;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;
export const AlertDialogAction = AlertDialogPrimitive.Action;

export const AlertDialogOverlay = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(function AlertDialogOverlay({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Overlay
      ref={ref}
      className={cn('fixed inset-0 z-40 bg-overlay animate-[fade-in_200ms_ease-out]', className)}
      {...props}
    />
  );
});

export const AlertDialogContent = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content> & { children: ReactNode }
>(function AlertDialogContent({ className, children, ...props }, ref) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[480px] max-w-[calc(100vw-48px)] max-h-[calc(100vh-48px)] -translate-x-1/2 -translate-y-1/2 overflow-auto border border-border-subtle bg-panel shadow-float relative animate-[dialog-in_240ms_ease-out]',
          className,
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  );
});

export function AlertDialogHeader({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-7 pb-3.5 pt-5.5">
      {children}
    </div>
  );
}

export const AlertDialogTitle = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(function AlertDialogTitle({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Title
      ref={ref}
      className={cn(
        'font-serif text-[22px] font-normal tracking-[-0.015em] text-text-primary',
        className,
      )}
      {...props}
    />
  );
});

export const AlertDialogDescription = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(function AlertDialogDescription({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Description
      ref={ref}
      className={cn('text-sm text-text-secondary', className)}
      {...props}
    />
  );
});

export function AlertDialogFooter({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex justify-end gap-2.5 border-t border-border-subtle bg-sidebar px-7 py-4">
      {children}
    </div>
  );
}
