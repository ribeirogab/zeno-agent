import NotFound from '@/app/not-found';

/**
 * 404 page preview — renders the production NotFound component inline so
 * the maintainer can review visuals without triggering an actual 404.
 */
export default function NotFoundPreview() {
  return (
    <section>
      <h1>404 page preview</h1>
      <p style={{ color: 'var(--color-fd-muted-foreground)' }}>
        Renders the production 404 inline for visual review.
      </p>
      <hr />
      <NotFound />
    </section>
  );
}
