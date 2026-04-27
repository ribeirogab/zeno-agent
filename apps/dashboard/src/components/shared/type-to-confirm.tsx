/**
 * Type-to-confirm input. Spec 0046.
 *
 * Used by destructive modals (M10 remove installation, M12 uninstall App)
 * and by the generic ConfirmModal (spec 0051). The user must type the
 * expected value EXACTLY before the destructive CTA enables. Native input
 * element keeps it screen-reader-friendly.
 *
 * The expected value is rendered above the input in italic gold (Fraunces) so
 * the visual cue matches the modal title style.
 */

import { Input } from '@zeno/ui';
import type { JSX } from 'react';
import { useId } from 'react';

export interface TypeToConfirmProps {
  /** Expected value the user must type to enable the CTA. */
  expected: string;
  /** Optional label shown above the input. Defaults to "type the value to confirm". */
  label?: string;
  /** Current input value. */
  value: string;
  /** Setter for the input value. */
  onChange: (next: string) => void;
  /**
   * If true, render the expected value in italic gold (Fraunces) — used by
   * M12 (uninstall App) where the value is a human App name.
   */
  italicGold?: boolean;
  /**
   * If true, render the expected value in monospace — used by M10 (confirms
   * installation name) and ConfirmModal (generic identifier-shaped values).
   */
  mono?: boolean;
  /** Optional id for the input (for label association). */
  id?: string;
  placeholder?: string;
}

export function TypeToConfirm({
  expected,
  label,
  value,
  onChange,
  italicGold,
  mono,
  id,
  placeholder,
}: TypeToConfirmProps): JSX.Element {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const matches = value === expected;
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className="font-mono text-[10px] tracking-[0.18em] leading-3 uppercase text-gold"
      >
        {label ?? `type the value to confirm`}
      </label>
      <span
        className={`${
          italicGold
            ? 'font-serif italic text-[18px] leading-6 text-gold'
            : mono
              ? 'font-mono text-[13px] text-text-primary'
              : 'font-sans text-[13px] text-text-primary'
        }`}
        aria-hidden="true"
      >
        {expected}
      </span>
      <Input
        id={inputId}
        type="text"
        value={value}
        placeholder={placeholder ?? expected}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={value.length > 0 && !matches}
        className={`bg-panel-2 border px-3 py-2.5 ${
          matches
            ? 'border-status-active/50 text-text-primary'
            : value.length > 0
              ? 'border-status-failed/50 text-text-primary'
              : 'border-border-subtle text-text-primary'
        } ${mono ? 'font-mono' : 'font-sans'} text-[13px]`}
      />
    </div>
  );
}

/**
 * Reusable hook for the matching state.
 */
export function useTypeToConfirm(expected: string, value: string): boolean {
  return value === expected;
}
