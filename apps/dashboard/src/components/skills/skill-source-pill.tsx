/**
 * Spec 0062 — locked palette per source enum:
 * - dashboard      → bg #1B1F2E + text #8A8FAB (neutral)
 * - zeno_default   → bg #D9B3621A + text #D9B362 (gold)
 * - profile        → bg #7AA6E81A + text #7AA6E8 (cyan)
 *
 * The component is reused on the skills list, the detail header, the
 * install-modal preview card, and both delete modals so the contract is
 * defined once.
 */

import type { SkillSource } from '@/lib/use-skills';

interface SkillSourcePillProps {
  source: SkillSource;
}

const VARIANTS: Record<
  SkillSource,
  { bg: string; border: string; text: string; dot: string; label: string }
> = {
  dashboard: {
    bg: '#1B1F2E',
    border: '#2A2F45',
    text: '#8A8FAB',
    dot: '#8A8FAB',
    label: 'dashboard',
  },
  zeno_default: {
    bg: '#D9B3621A',
    border: '#D9B36247',
    text: '#D9B362',
    dot: '#D9B362',
    label: 'zeno_default',
  },
  profile: {
    bg: '#7AA6E81A',
    border: '#7AA6E847',
    text: '#7AA6E8',
    dot: '#7AA6E8',
    label: 'profile',
  },
};

export function SkillSourcePill({ source }: SkillSourcePillProps) {
  const v = VARIANTS[source];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 22,
        borderRadius: 11,
        padding: '4px 10px',
        gap: 6,
        background: v.bg,
        border: `1px solid ${v.border}`,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        lineHeight: '14px',
        color: v.text,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: v.dot,
          flexShrink: 0,
        }}
      />
      {v.label}
    </span>
  );
}
