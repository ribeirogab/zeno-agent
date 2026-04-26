import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState, ErrorState, Skeleton } from '../src/index.js';

describe('Skeleton', () => {
  it('renders with aria-busy', () => {
    const { container } = render(<Skeleton className="h-4 w-32" />);
    const node = container.firstChild as HTMLElement;
    expect(node.getAttribute('aria-busy')).toBe('true');
    expect(node.className).toContain('animate-pulse');
    expect(node.className).toContain('h-4');
  });
});

describe('EmptyState', () => {
  it('renders title and optional description + action', () => {
    render(
      <EmptyState
        title="nothing here"
        description="create your first item."
        action={<button type="button">new</button>}
      />,
    );
    expect(screen.getByText('nothing here')).toBeDefined();
    expect(screen.getByText('create your first item.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'new' })).toBeDefined();
  });

  it('omits description and action when not provided', () => {
    render(<EmptyState title="title only" />);
    expect(screen.getByText('title only')).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ErrorState', () => {
  it('uses default title "something went wrong"', () => {
    render(<ErrorState />);
    expect(screen.getByText('something went wrong')).toBeDefined();
  });

  it('calls onRetry when the button is clicked', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorState onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: 'try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits retry button when onRetry is absent', () => {
    render(<ErrorState />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
