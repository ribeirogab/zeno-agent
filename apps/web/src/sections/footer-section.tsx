import type { CSSProperties } from 'react';
import { FooterRule } from '../components/footer-rule';
import { ZenoCrest } from '../components/zeno-crest';
import { GITHUB_URL, LICENSE_URL, ROADMAP_URL } from '../lib/constants';

const linkStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--color-text-secondary)',
  textDecoration: 'none',
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
        <a href={GITHUB_URL} data-footer-link="" style={linkStyle}>
          GitHub
        </a>
        <a href={ROADMAP_URL} data-footer-link="" style={linkStyle}>
          Roadmap
        </a>
        <a href={LICENSE_URL} data-footer-link="" style={linkStyle}>
          License
        </a>
      </div>
    </footer>
  );
}
