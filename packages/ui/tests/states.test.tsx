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
        title="nada por aqui"
        description="crie seu primeiro item."
        action={<button type="button">novo</button>}
      />,
    );
    expect(screen.getByText('nada por aqui')).toBeDefined();
    expect(screen.getByText('crie seu primeiro item.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'novo' })).toBeDefined();
  });

  it('omits description and action when not provided', () => {
    render(<EmptyState title="só o título" />);
    expect(screen.getByText('só o título')).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ErrorState', () => {
  it('uses default title "algo deu errado"', () => {
    render(<ErrorState />);
    expect(screen.getByText('algo deu errado')).toBeDefined();
  });

  it('calls onRetry when the button is clicked', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorState onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: 'tentar de novo' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits retry button when onRetry is absent', () => {
    render(<ErrorState />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
