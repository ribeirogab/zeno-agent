import { describe, expect, it } from 'vitest';
import { applyCap } from '../src/cap.js';

describe('applyCap', () => {
  it('returns the original content when under the cap', () => {
    const out = applyCap('hello world', 8 * 1024);
    expect(out).toEqual({
      content: 'hello world',
      truncated: false,
      originalBytes: 11,
      droppedCount: 0,
    });
  });

  it('truncates at a line break when over the cap and appends the footer', () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `- [file-${i}.md](file-${i}.md)`).join(
      '\n',
    );
    const out = applyCap(lines, 200);
    expect(out.truncated).toBe(true);
    expect(out.originalBytes).toBeGreaterThan(200);
    expect(out.droppedCount).toBeGreaterThan(0);
    expect(out.content.endsWith('full list)')).toBe(true);
  });

  it('counts dropped files by counting lines that begin with `- [`', () => {
    const lines = ['- [a.md](a.md)', '- [b.md](b.md)', '- [c.md](c.md)'].join('\n');
    const out = applyCap(lines, 25);
    expect(out.truncated).toBe(true);
    expect(out.droppedCount).toBeGreaterThan(0);
  });
});
