import type { CSSProperties } from 'react';
import { FooterRule } from '../components/footer-rule';
import { TextLink } from '../components/text-link';
import { ZenoCrest } from '../components/zeno-crest';
import { GITHUB_URL, LICENSE_URL, ROADMAP_URL } from '../lib/constants';

// Layout-only inline style for the footer text links. Color, hover,
// transition, text-decoration owned by `[data-text-link]` in index.css.
const linkStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  fontWeight: 500,
};

// Footer. Top gold gradient rule for finish, small crest on the left,
// three text links on the right (GitHub, Roadmap, License).
// No copyright line, no @handle.
export function FooterSection() {
  return (
    <footer
      role="contentinfo"
      aria-label="footer"
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '32px 192px',
        backgroundColor: 'var(--color-sidebar)',
        gap: '24px',
      }}
    >
      <FooterRule />
      <ZenoCrest size={28} />
      <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
        <TextLink href={GITHUB_URL} style={linkStyle}>
          GitHub
        </TextLink>
        <TextLink href={ROADMAP_URL} style={linkStyle}>
          Roadmap
        </TextLink>
        <TextLink href={LICENSE_URL} style={linkStyle}>
          License
        </TextLink>
      </div>
    </footer>
  );
}
