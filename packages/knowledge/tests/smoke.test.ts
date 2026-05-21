import { describe, expect, it } from 'vitest';
import * as knowledge from '../src/index.js';

describe('@zeno/knowledge barrel', () => {
  it('exports the documented surface', () => {
    expect(typeof knowledge.scanKnowledge).toBe('function');
    expect(typeof knowledge.renderIndex).toBe('function');
    expect(typeof knowledge.applyCap).toBe('function');
    expect(typeof knowledge.parseFrontmatter).toBe('function');
    expect(typeof knowledge.resolveRelated).toBe('function');
  });
});
