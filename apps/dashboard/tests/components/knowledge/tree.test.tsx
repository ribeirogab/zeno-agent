import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeTree } from '@/components/knowledge/tree';

afterEach(cleanup);

const files = [
  { path: 'foo.md', title: 'Foo', bytes: 10, mtime: '', tags: [] },
  {
    path: 'processes/release-flow.md',
    title: 'Release Flow',
    bytes: 20,
    mtime: '',
    tags: [],
  },
  { path: '_index.md', title: 'index', bytes: 5, mtime: '', tags: [] },
];

describe('<KnowledgeTree>', () => {
  it('renders root files and nested folders', () => {
    render(
      <KnowledgeTree
        files={files}
        selectedPath={undefined}
        showMeta={false}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('foo.md')).toBeTruthy();
    expect(screen.getByText('processes')).toBeTruthy();
  });

  it('hides _-prefixed files when showMeta is false', () => {
    render(
      <KnowledgeTree
        files={files}
        selectedPath={undefined}
        showMeta={false}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByText('_index.md')).toBeNull();
  });

  it('reveals _-prefixed files when showMeta is true', () => {
    render(
      <KnowledgeTree files={files} selectedPath={undefined} showMeta={true} onSelect={() => {}} />,
    );
    expect(screen.getByText('_index.md')).toBeTruthy();
  });

  it('auto-expands ancestors of selected path', () => {
    render(
      <KnowledgeTree
        files={files}
        selectedPath="processes/release-flow.md"
        showMeta={false}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('release-flow.md')).toBeTruthy();
  });

  it('calls onSelect with file path when a file is clicked', () => {
    const onSelect = vi.fn();
    render(
      <KnowledgeTree
        files={files}
        selectedPath={undefined}
        showMeta={false}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByText('foo.md'));
    expect(onSelect).toHaveBeenCalledWith('foo.md');
  });
});
