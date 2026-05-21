import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Canvas } from './canvas';
import { DEFAULT_DISPLAY_STATE } from './types';

describe('Canvas (mocked react-force-graph-2d)', () => {
  it('renders the mock with node + link counts', () => {
    render(
      <Canvas
        nodes={[
          { id: 'a.md', label: 'A', group: '', size: 1, tags: [], exists: true, isMeta: false },
          { id: 'b.md', label: 'B', group: '', size: 1, tags: [], exists: true, isMeta: false },
        ]}
        links={[{ source: 'a.md', target: 'b.md' }]}
        groups={[{ group: '', color: '#d9b362' }]}
        display={DEFAULT_DISPLAY_STATE}
        onNodeClick={() => {}}
      />,
    );
    const stub = screen.getByTestId('force-graph-2d');
    expect(stub.getAttribute('data-node-count')).toBe('2');
    expect(stub.getAttribute('data-link-count')).toBe('1');
  });

  it('calls onNodeClick when the canvas stub is clicked', async () => {
    const onClick = vi.fn();
    render(
      <Canvas
        nodes={[
          { id: 'a.md', label: 'A', group: '', size: 0, tags: [], exists: true, isMeta: false },
        ]}
        links={[]}
        groups={[]}
        display={DEFAULT_DISPLAY_STATE}
        onNodeClick={onClick}
      />,
    );
    await userEvent.click(screen.getByTestId('force-graph-2d'));
    expect(onClick).toHaveBeenCalledWith('a.md');
  });
});
