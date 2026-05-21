import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '@/agent/system-prompt';

describe('buildSystemPrompt', () => {
  it('concatenates SOUL and AGENTS with a blank line and no "About the user" heading', () => {
    const out = buildSystemPrompt('You are Zeno.', '# Agent Operating Manual\n\nRule 1.', null);
    expect(out).toBe('You are Zeno.\n\n# Agent Operating Manual\n\nRule 1.');
    expect(out).not.toContain('# About the user');
  });

  it('falls back to a minimal default when SOUL.md is missing', () => {
    const out = buildSystemPrompt(null, '# Agent Operating Manual\n\nRule 1.', null);
    expect(out).toContain('You are Zeno');
    expect(out).toContain('# Agent Operating Manual');
  });

  it('emits a generic note when AGENTS.md is missing', () => {
    const out = buildSystemPrompt('You are Zeno.', null, null);
    expect(out).toContain('AGENTS.md not found');
    // Regression guard: the legacy framing (per-profile user-bio file +
    // '# About the user' heading) must never resurface in the system prompt.
    expect(out).not.toMatch(/[uU]SER\.md/);
    expect(out).not.toContain('About the user');
  });

  it('handles both files missing without throwing', () => {
    const out = buildSystemPrompt(null, null, null);
    expect(out).toContain('You are Zeno');
    expect(out).toContain('AGENTS.md not found');
  });

  it('trims surrounding whitespace from both files', () => {
    const out = buildSystemPrompt('  You are Zeno.  \n\n', '\n\n# Manual\n\n', null);
    expect(out).toBe('You are Zeno.\n\n# Manual');
  });
});

describe('buildSystemPrompt with knowledge block', () => {
  it('omits the knowledge section entirely when knowledgeBlock is null', () => {
    const out = buildSystemPrompt('SOUL.', 'AGENTS.', null);
    expect(out).toBe('SOUL.\n\nAGENTS.');
    expect(out).not.toContain('# Knowledge available');
  });

  it('omits the knowledge section entirely when knowledgeBlock is empty', () => {
    const out = buildSystemPrompt('SOUL.', 'AGENTS.', '');
    expect(out).toBe('SOUL.\n\nAGENTS.');
    expect(out).not.toContain('# Knowledge available');
  });

  it('appends the knowledge block under # Knowledge available after AGENTS', () => {
    const out = buildSystemPrompt('SOUL.', 'AGENTS.', '<!-- index -->\n\n## Files\n\n- a.md');
    expect(out).toBe(
      'SOUL.\n\nAGENTS.\n\n# Knowledge available\n\n<!-- index -->\n\n## Files\n\n- a.md',
    );
  });
});
