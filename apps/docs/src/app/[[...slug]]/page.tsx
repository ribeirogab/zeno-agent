import { MarkdownCopyButton, ViewOptionsPopover } from 'fumadocs-ui/layouts/docs/page';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/page';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CopyMarkdownUrlButton } from '@/components/copy-markdown-url-button';
import { editOnGithub } from '@/lib/edit-on-github';
import { source } from '@/lib/source';
import { getMDXComponents } from '@/mdx-components';

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  const MDX = page.data.body;

  const slugString = (slug ?? []).join('/');
  const markdownUrl = `/llms.mdx/${slugString}`;

  return (
    <DocsPage toc={page.data.toc} editOnGithub={editOnGithub(page.path)}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <div className="not-prose mb-4 flex flex-wrap items-center gap-2">
        <MarkdownCopyButton markdownUrl={markdownUrl} />
        <CopyMarkdownUrlButton markdownUrl={markdownUrl} />
        <ViewOptionsPopover markdownUrl={markdownUrl} />
      </div>
      <DocsBody>
        <MDX components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();
  return {
    title: page.data.title,
    description: page.data.description,
  };
}
