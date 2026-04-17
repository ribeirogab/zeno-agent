import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, cn } from '../src/index.js';

describe('@zeno/ui smoke', () => {
  it('exports cn and composes class strings', () => {
    expect(cn('a', 'b', 'c')).toContain('a');
    expect(cn('a', false && 'b', 'c')).not.toContain('b');
  });

  it('renders Button with its label', () => {
    render(<Button>howdy</Button>);
    expect(screen.getByRole('button', { name: 'howdy' })).toBeDefined();
  });

  it('applies variant classes', () => {
    render(<Button variant="accent">go</Button>);
    const btn = screen.getByRole('button', { name: 'go' });
    expect(btn.className).toContain('bg-accent');
  });
});
