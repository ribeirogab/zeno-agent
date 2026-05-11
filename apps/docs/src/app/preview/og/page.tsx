import { source } from '@/lib/source';

/**
 * OG image preview — grid of `<img src="/og?slug=<slug>">` for every real
 * doc slug, plus the implicit root slug which exercises a frontmatter-less
 * shape via the route's fallback when `page` is null (returns "Zeno" title
 * and no description).
 *
 * Lets the maintainer eyeball every card in one screen instead of opening
 * 12 browser tabs.
 */
export default function OGPreview() {
  const slugs = source.generateParams();

  return (
    <section>
      <h1>OG image preview</h1>
      <p style={{ color: 'var(--color-fd-muted-foreground)' }}>
        Every doc slug, rendered through <code>/og?slug=&lt;slug&gt;</code>. A synthetic entry with
        no slug exercises the missing-page / missing-description fallback (root brand title only).
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '1rem',
        }}
      >
        {[{ slug: ['__missing_test_slug__'] }, ...slugs].map((entry) => {
          const slugPath = entry.slug ? entry.slug.join('/') : '';
          const ogUrl = slugPath ? `/og?slug=${encodeURIComponent(slugPath)}` : '/og';
          const caption = slugPath || '(empty slug)';
          return (
            <figure key={caption} style={{ margin: 0 }}>
              <img
                src={ogUrl}
                width="600"
                height="315"
                alt={`OG for ${caption}`}
                style={{
                  width: '100%',
                  height: 'auto',
                  border: '1px solid var(--color-fd-border)',
                  borderRadius: '8px',
                }}
              />
              <figcaption
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--color-fd-muted-foreground)',
                  marginTop: '0.25rem',
                }}
              >
                {caption}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}
