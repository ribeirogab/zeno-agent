import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '../src/index.js';

describe('Button', () => {
  it('renders default variant', () => {
    render(<Button>click</Button>);
    const btn = screen.getByRole('button', { name: 'click' });
    expect(btn.className).toContain('border-border-strong');
  });

  it('renders primary variant with gold background', () => {
    render(<Button variant="primary">go</Button>);
    const btn = screen.getByRole('button', { name: 'go' });
    expect(btn.className).toContain('bg-gold');
    expect(btn.className).toContain('border-gold');
  });

  it('renders ghost variant with transparent border', () => {
    render(<Button variant="ghost">ghost</Button>);
    const btn = screen.getByRole('button', { name: 'ghost' });
    expect(btn.className).toContain('border-transparent');
  });

  it('renders outline variant with gold-line border', () => {
    render(<Button variant="outline">outline</Button>);
    const btn = screen.getByRole('button', { name: 'outline' });
    expect(btn.className).toContain('border-gold-line');
    expect(btn.className).toContain('text-gold');
  });

  it('renders danger variant with failed color', () => {
    render(<Button variant="danger">delete</Button>);
    const btn = screen.getByRole('button', { name: 'delete' });
    expect(btn.className).toContain('text-status-failed');
  });

  it('applies sm size', () => {
    render(<Button size="sm">small</Button>);
    const btn = screen.getByRole('button', { name: 'small' });
    expect(btn.className).toContain('px-2.5');
    expect(btn.className).toContain('py-1');
  });

  it('applies md size by default', () => {
    render(<Button>medium</Button>);
    const btn = screen.getByRole('button', { name: 'medium' });
    expect(btn.className).toContain('px-3.5');
    expect(btn.className).toContain('py-2');
  });

  it('uses mono font and uppercase', () => {
    render(<Button>styled</Button>);
    const btn = screen.getByRole('button', { name: 'styled' });
    expect(btn.className).toContain('font-mono');
    expect(btn.className).toContain('uppercase');
  });
});
