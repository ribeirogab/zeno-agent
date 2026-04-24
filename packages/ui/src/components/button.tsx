import { cva, type VariantProps } from 'class-variance-authority';
import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../utils';

const buttonVariants = cva(
  'inline-flex items-center gap-2 whitespace-nowrap font-mono text-xs font-medium uppercase tracking-[0.06em] transition-all duration-[120ms] disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default: 'border border-border-strong bg-transparent text-text-primary hover:border-text-tertiary',
        primary: 'border border-gold bg-gold text-text-ink font-semibold hover:bg-gold-bright hover:border-gold-bright',
        ghost: 'border border-transparent bg-transparent text-text-secondary hover:text-gold hover:border-gold-line hover:bg-gold-soft',
        outline: 'border border-gold-line text-gold hover:border-gold hover:bg-gold-soft',
        danger: 'border border-status-failed/30 text-status-failed hover:bg-status-failed/[0.08] hover:border-status-failed',
      },
      size: {
        sm: 'px-2.5 py-1 text-[10px] tracking-[0.1em]',
        md: 'px-3.5 py-2',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, ...rest },
  ref,
) {
  return (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...rest} />
  );
});
