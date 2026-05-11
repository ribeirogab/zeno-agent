import { Callout } from 'fumadocs-ui/components/callout';

/**
 * Callout palette preview. Four variants render side by side so the
 * maintainer can verify the bound tokens match the Imperial status palette
 * (info → status-info, error → status-failed, success → status-active) and
 * that warn deliberately stays at Fumadocs's default amber (gold reserved).
 */
export default function CalloutPreview() {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h1>Callout palette preview</h1>
      <Callout type="info">Info — should render in Imperial blue (#7aa6e8).</Callout>
      <Callout type="warn">Warn — should render in Fumadocs default amber (not gold).</Callout>
      <Callout type="error">Error — should render in Imperial red (#e8617a).</Callout>
      <Callout type="success">Success — should render in Imperial green (#6bd3a3).</Callout>
    </section>
  );
}
