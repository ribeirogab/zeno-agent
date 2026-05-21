import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

import { KnowledgeViewer } from '@/components/knowledge/viewer';

afterEach(cleanup);

describe('<KnowledgeViewer>', () => {
  it('renders empty state when no file', () => {
    render(<KnowledgeViewer file={null} />);
    expect(screen.getByText(/Select a file/i)).toBeTruthy();
  });

  it('renders markdown for a loaded file', () => {
    render(
      <KnowledgeViewer
        file={{
          path: 'foo.md',
          content: '# Title\n\n- one\n- two',
          frontmatter: null,
          title: 'Title',
          bytes: 12,
          mtime: '2026-05-20T10:00:00Z',
          wikilinks: {},
        }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Title' })).toBeTruthy();
    expect(screen.getByText('one')).toBeTruthy();
  });

  it('renders a resolved wikilink as a link', () => {
    render(
      <KnowledgeViewer
        file={{
          path: 'foo.md',
          content: 'see [[bar]] now',
          frontmatter: null,
          title: 'foo',
          bytes: 20,
          mtime: '2026-05-20T10:00:00Z',
          wikilinks: { bar: 'bar.md' },
        }}
      />,
    );
    const anchor = screen.getByText('bar').closest('a');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('href') ?? '').toContain('bar.md');
  });

  it('renders an unresolved wikilink as a broken span', () => {
    render(
      <KnowledgeViewer
        file={{
          path: 'foo.md',
          content: 'see [[ghost]] now',
          frontmatter: null,
          title: 'foo',
          bytes: 20,
          mtime: '2026-05-20T10:00:00Z',
          wikilinks: { ghost: null },
        }}
      />,
    );
    const broken = document.querySelector('[data-broken="true"]');
    expect(broken).not.toBeNull();
    expect(broken?.getAttribute('title')).toBe('wikilink not found: ghost');
  });

  it('shows frontmatter-invalid warning when frontmatter is null and content starts with ---', () => {
    render(
      <KnowledgeViewer
        file={{
          path: 'foo.md',
          content: '---\ntitle: "unclosed\n---\nbody',
          frontmatter: null,
          title: 'foo.md',
          bytes: 30,
          mtime: '2026-05-20T10:00:00Z',
          wikilinks: {},
        }}
      />,
    );
    expect(screen.getByText(/frontmatter invalid/i)).toBeTruthy();
  });
});
