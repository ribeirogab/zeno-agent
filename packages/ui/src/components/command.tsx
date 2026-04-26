import { Command as CommandPrimitive } from 'cmdk';
import type { ComponentPropsWithoutRef, ElementRef, HTMLAttributes, JSX, ReactNode } from 'react';
import { forwardRef } from 'react';
import { cn } from '../utils';

/**
 * Imperial-Terminal-styled command primitives wrapping `cmdk`. Visual lineage:
 * shadcn/ui's Command — re-themed for the Zeno dashboard.
 *
 * Usage:
 *   <CommandPalette open={open} onOpenChange={setOpen}>
 *     <CommandInput placeholder="search…" />
 *     <CommandList>
 *       <CommandEmpty>no matches.</CommandEmpty>
 *       <CommandGroup heading="navigate">
 *         <CommandItem onSelect={() => goto('/')}>home</CommandItem>
 *       </CommandGroup>
 *     </CommandList>
 *   </CommandPalette>
 */
export const Command = forwardRef<
  ElementRef<typeof CommandPrimitive>,
  ComponentPropsWithoutRef<typeof CommandPrimitive>
>(function Command({ className, ...props }, ref) {
  return (
    <CommandPrimitive
      ref={ref}
      className={cn(
        'flex h-full w-full flex-col overflow-hidden bg-panel text-text-primary',
        className,
      )}
      {...props}
    />
  );
});

/**
 * Modal-style command surface — opens on `open=true`, closes on Escape or
 * overlay click. Mounts the palette in a portal.
 */
export function CommandPalette({
  open,
  onOpenChange,
  label,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ARIA label for the dialog. Defaults to "Command palette". */
  label?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <CommandPrimitive.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label={label ?? 'Command palette'}
      overlayClassName="fixed inset-0 z-40 bg-overlay animate-[fade-in_200ms_ease-out]"
      contentClassName="fixed left-1/2 top-[18%] z-50 w-[560px] max-w-[calc(100vw-48px)] max-h-[calc(100vh-180px)] -translate-x-1/2 overflow-hidden border border-border-subtle bg-panel shadow-float animate-[dialog-in_240ms_ease-out] flex flex-col"
    >
      {children}
    </CommandPrimitive.Dialog>
  );
}

export const CommandInput = forwardRef<
  ElementRef<typeof CommandPrimitive.Input>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(function CommandInput({ className, ...props }, ref) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border-subtle">
      <span className="font-mono text-[12px] leading-none text-gold shrink-0">⌕</span>
      <CommandPrimitive.Input
        ref={ref}
        className={cn(
          'flex-1 bg-transparent border-0 outline-none font-mono text-[13px] leading-5 text-text-primary placeholder:text-text-tertiary',
          className,
        )}
        {...props}
      />
    </div>
  );
});

export const CommandList = forwardRef<
  ElementRef<typeof CommandPrimitive.List>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(function CommandList({ className, ...props }, ref) {
  return (
    <CommandPrimitive.List
      ref={ref}
      className={cn('max-h-[360px] overflow-y-auto overflow-x-hidden py-1', className)}
      {...props}
    />
  );
});

export const CommandEmpty = forwardRef<
  ElementRef<typeof CommandPrimitive.Empty>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(function CommandEmpty({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Empty
      ref={ref}
      className={cn(
        'py-6 text-center font-mono text-[12px] leading-4 text-text-tertiary',
        className,
      )}
      {...props}
    />
  );
});

export const CommandGroup = forwardRef<
  ElementRef<typeof CommandPrimitive.Group>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(function CommandGroup({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Group
      ref={ref}
      className={cn(
        'overflow-hidden p-1 text-text-primary [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-[0.2em] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-text-tertiary',
        className,
      )}
      {...props}
    />
  );
});

export const CommandSeparator = forwardRef<
  ElementRef<typeof CommandPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(function CommandSeparator({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Separator
      ref={ref}
      className={cn('h-px bg-border-subtle mx-2', className)}
      {...props}
    />
  );
});

export const CommandItem = forwardRef<
  ElementRef<typeof CommandPrimitive.Item>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(function CommandItem({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2.5 px-3 py-2 font-mono text-[12px] leading-4 text-text-secondary outline-none transition-colors duration-[120ms] data-[selected='true']:bg-gold-soft data-[selected='true']:text-gold data-[disabled='true']:pointer-events-none data-[disabled='true']:opacity-50",
        className,
      )}
      {...props}
    />
  );
});

export function CommandShortcut({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>): JSX.Element {
  return (
    <span
      className={cn('ml-auto font-mono text-[10px] tracking-[0.1em] text-text-tertiary', className)}
      {...props}
    />
  );
}
