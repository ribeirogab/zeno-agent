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
        'w-full bg-panel-2 border border-border-subtle px-3 py-2.5 font-mono text-[13px] text-text-primary transition-all duration-[120ms] placeholder:text-text-tertiary focus:border-gold focus:outline-none focus:ring-3 focus:ring-gold-ring',
        className,
      )}
      {...rest}
    />
  );
});
