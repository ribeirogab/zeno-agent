import type { ReactNode } from 'react';

type GoldRuleProps = {
  children: ReactNode;
};

// Thin gold left rule used by the experimental warning section.
// Visually anchors the inline-laid kicker + body without taking
// the visual weight of a bordered callout.
export function GoldRule({ children }: GoldRuleProps) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        gap: '14px',
        padding: '14px 18px 14px 16px',
        borderLeft: '2px solid var(--color-gold)',
        alignItems: 'baseline',
      }}
    >
      {children}
    </div>
  );
}
