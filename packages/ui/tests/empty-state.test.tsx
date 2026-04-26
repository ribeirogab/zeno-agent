import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from '../src/index.js';

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="nothing here" />);
    expect(screen.getByText('nothing here')).toBeDefined();
  });

  it('renders optional description', () => {
    render(<EmptyState title="empty" description="create your first item" />);
    expect(screen.getByText('create your first item')).toBeDefined();
  });

  it('omits description when not provided', () => {
    const { container } = render(<EmptyState title="empty" />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBe(0);
  });

  it('renders optional action', () => {
    render(<EmptyState title="empty" action={<button type="button">create</button>} />);
    expect(screen.getByRole('button', { name: 'create' })).toBeDefined();
  });

  it('omits action when not provided', () => {
    render(<EmptyState title="empty" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders the Crest icon as SVG', () => {
    const { container } = render(<EmptyState title="empty" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });
});
