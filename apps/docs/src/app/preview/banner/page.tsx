import { Banner } from 'fumadocs-ui/components/banner';

/**
 * Banner preview — renders the production Banner isolated for contrast review.
 * The production Banner is mounted in `app/layout.tsx` above the DocsLayout;
 * this route lets the maintainer review the copy + contrast in isolation.
 */
export default function BannerPreview() {
  return (
    <section>
      <h1>Banner preview</h1>
      <p>Same Banner that mounts in `app/layout.tsx`, isolated for contrast review.</p>
      <Banner changeLayout={false}>
        Zeno is experimental. Personal project, no SLA, breaking changes expected.
      </Banner>
    </section>
  );
}
