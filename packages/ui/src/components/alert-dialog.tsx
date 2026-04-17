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
      className={cn('fixed inset-0 z-40 bg-black/60 backdrop-blur-sm', className)}
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
          'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-5 rounded-xl border border-border-subtle bg-panel p-8 shadow-lg',
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
  return <div className="flex flex-col gap-1.5">{children}</div>;
}

export const AlertDialogTitle = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(function AlertDialogTitle({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Title
      ref={ref}
      className={cn('font-serif text-2xl leading-tight text-text-primary', className)}
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
  return <div className="flex justify-end gap-3">{children}</div>;
}
