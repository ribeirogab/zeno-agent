import { type JSX, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { KnowledgeEmptyState } from '@/components/knowledge/empty-state';
import { wikilinkPlugin } from '@/components/knowledge/wikilink-plugin';
import type { KnowledgeFileResponse } from '@/lib/use-knowledge';

interface Props {
  file: KnowledgeFileResponse | null;
}

export function KnowledgeViewer({ file }: Props): JSX.Element {
  const plugins = useMemo(
    () =>
      file === null ? [remarkGfm] : [remarkGfm, [wikilinkPlugin, { wikilinks: file.wikilinks }]],
    [file],
  );
  if (file === null) {
    return <KnowledgeEmptyState />;
  }
  const frontmatterBroken = file.frontmatter === null && file.content.startsWith('---');
  const tags = Array.isArray(file.frontmatter?.tags) ? (file.frontmatter.tags as string[]) : [];
  return (
    <article className="flex flex-col gap-4">
      <header className="border-b border-border-subtle pb-3 flex flex-col gap-2">
        <Breadcrumb path={file.path} />
        <div className="font-mono text-[11px] text-text-tertiary flex gap-3 flex-wrap">
          <span>{formatBytes(file.bytes)}</span>
          <span>·</span>
          <span>edited {formatRelativeTime(file.mtime)}</span>
          {tags.length > 0 ? (
            <>
              <span>·</span>
              <span>{tags.map((t) => `#${t}`).join(' ')}</span>
            </>
          ) : null}
        </div>
        {frontmatterBroken ? (
          <div className="font-mono text-[11px] text-status-failed">frontmatter invalid</div>
        ) : null}
      </header>
      <div className="prose prose-invert max-w-none font-sans text-sm leading-[1.6]">
        <ReactMarkdown
          remarkPlugins={plugins as Parameters<typeof ReactMarkdown>[0]['remarkPlugins']}
          components={markdownComponents}
        >
          {file.content}
        </ReactMarkdown>
      </div>
    </article>
  );
}

const markdownComponents: Components = {
  a({ href, children, ...props }) {
    const dataBroken = (props as { 'data-broken'?: string })['data-broken'];
    if (dataBroken === 'true') {
      return (
        <span {...(props as Record<string, unknown>)} className="wikilink-broken">
          {children}
        </span>
      );
    }
    return (
      <a {...props} href={href}>
        {children}
      </a>
    );
  },
};

function Breadcrumb({ path }: { path: string }): JSX.Element {
  const parts = path.split('/');
  return (
    <h2 className="font-mono text-[13px] text-text-primary m-0">
      {parts.map((part, idx) => {
        const acc = parts.slice(0, idx + 1).join('/');
        return (
          <span key={acc}>
            {idx > 0 ? <span className="text-text-tertiary"> / </span> : null}
            <span>{part}</span>
          </span>
        );
      })}
    </h2>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const deltaMs = Date.now() - then;
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
