import type { JSX } from 'react';

export interface CrestProps {
  size?: number;
  ornate?: boolean;
}

/**
 * Zeno brand mark. Inlined here (not imported from @zeno/ui) so apps/docs
 * has no workspace dependency on the dashboard's UI package — see the
 * apps-docs-scaffold spec Non-Goals. Source of truth: packages/ui/src/components/crest.tsx.
 */
export function Crest({ size = 28, ornate = false }: CrestProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <path d="M60 6 L114 60 L60 114 L6 60 Z" stroke="currentColor" strokeWidth="2.5" fill="none" />
      <path
        d="M60 14 L106 60 L60 106 L14 60 Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity="0.4"
        fill="none"
      />
      {ornate && (
        <path
          d="M60 22 L98 60 L60 98 L22 60 Z"
          stroke="currentColor"
          strokeWidth="0.75"
          strokeOpacity="0.2"
          fill="none"
        />
      )}
      <g fill="currentColor">
        <rect x="36" y="42" width="48" height="8" />
        <polygon points="76,50 84,50 44,70 36,70" />
        <rect x="36" y="70" width="48" height="8" />
      </g>
      <circle cx="60" cy="6" r="2" fill="currentColor" />
      <circle cx="60" cy="114" r="2" fill="currentColor" />
      <circle cx="6" cy="60" r="1.5" fill="currentColor" fillOpacity="0.5" />
      <circle cx="114" cy="60" r="1.5" fill="currentColor" fillOpacity="0.5" />
    </svg>
  );
}
