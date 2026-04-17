import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../utils';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'flex h-11 w-full rounded-md border border-border-subtle bg-canvas px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary disabled:opacity-50',
        className,
      )}
      {...rest}
    />
  );
});
