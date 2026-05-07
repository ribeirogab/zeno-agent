import { DiagramFlow } from '../components/diagram-flow';

const NODES = [
  {
    kicker: 'channel',
    name: 'Slack',
    caption: 'Inbound mention or DM via Socket Mode',
  },
  {
    kicker: 'core',
    name: 'Channel adapter',
    caption: 'Normalizes the message, attaches USER.md context',
  },
  {
    kicker: 'backend',
    name: 'Agent · Claude',
    caption: 'Reasons over the request, decides which tools to call',
    highlighted: true,
  },
  {
    kicker: 'connectors',
    name: 'MCP servers',
    caption: 'GitHub · Linear · Klaviyo · whatever you install',
  },
] as const;

// How it works. Connector-model diagram. Four nodes connected by mono "→"
// glyphs; the third is highlighted (gold border + halo) to anchor the eye
// on Claude as the brain.
export function HowItWorksSection() {
  return (
    <section
      aria-label="how-it-works"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: '28px',
        padding: '32px 192px 64px',
        backgroundImage:
          'radial-gradient(ellipse 600px 300px at 50% 60%, rgba(217, 179, 98, 0.05) 0%, rgba(217, 179, 98, 0.02) 40%, rgba(8, 9, 15, 0) 80%)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h2
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            fontSize: '22px',
            lineHeight: '28px',
            color: 'var(--color-text-primary)',
            margin: 0,
          }}
        >
          <span style={{ color: 'var(--color-gold)' }}>›</span> How it works
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
            lineHeight: '22px',
            color: 'var(--color-text-secondary)',
            margin: 0,
          }}
        >
          A small core orchestrates pluggable parts. Adding a capability is always an installation,
          never a code change.
        </p>
      </div>
      <DiagramFlow nodes={NODES} />
    </section>
  );
}
