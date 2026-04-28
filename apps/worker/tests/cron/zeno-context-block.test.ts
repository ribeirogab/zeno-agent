import { describe, expect, it } from 'vitest';
import { buildZenoContextBlock, ZENO_CONTEXT_CAP_BYTES } from '@/cron/zeno-context-block';

describe('buildZenoContextBlock (spec 0054)', () => {
  it('returns null block when zero skills + zero connectors', () => {
    const r = buildZenoContextBlock([], []);
    expect(r.block).toBeNull();
    expect(r.droppedSkills).toEqual([]);
    expect(r.requestedBytes).toBe(0);
    expect(r.truncatedBytes).toBe(0);
  });

  it('builds skills-only block', () => {
    const r = buildZenoContextBlock([{ name: 'a', body: 'A' }], []);
    expect(r.block).toContain('linked_skills:');
    expect(r.block).toContain('## a');
    expect(r.block).toContain('A');
    expect(r.block).not.toContain('linked_connectors:');
    expect(r.droppedSkills).toEqual([]);
    expect(r.block?.startsWith('[zeno_context]')).toBe(true);
    expect(r.block?.endsWith('[/zeno_context]')).toBe(true);
  });

  it('builds connectors-only block', () => {
    const r = buildZenoContextBlock([], ['linear', 'sentry']);
    expect(r.block).toContain('linked_connectors: linear, sentry');
    expect(r.block).not.toContain('linked_skills:');
  });

  it('builds skills + connectors block', () => {
    const r = buildZenoContextBlock(
      [
        { name: 'a', body: 'A' },
        { name: 'b', body: 'B' },
      ],
      ['linear'],
    );
    expect(r.block).toContain('linked_skills:');
    expect(r.block).toContain('linked_connectors: linear');
    expect(r.block).toContain('---');
  });

  it('truncates skills past the bytes cap', () => {
    const big = 'x'.repeat(15_000);
    const r = buildZenoContextBlock(
      [
        { name: 'a', body: big },
        { name: 'b', body: big },
      ],
      [],
      ZENO_CONTEXT_CAP_BYTES,
    );
    expect(r.droppedSkills).toEqual(['b']);
    expect(r.block).toContain('## a');
    expect(r.block).not.toContain('## b');
    expect(r.requestedBytes).toBeGreaterThan(ZENO_CONTEXT_CAP_BYTES);
    expect(r.truncatedBytes).toBeLessThanOrEqual(ZENO_CONTEXT_CAP_BYTES);
  });

  it('keeps order stable when truncating from the tail', () => {
    const r = buildZenoContextBlock(
      [
        { name: 'first', body: 'x'.repeat(10_000) },
        { name: 'second', body: 'x'.repeat(15_000) },
        { name: 'third', body: 'x'.repeat(15_000) },
      ],
      [],
    );
    expect(r.droppedSkills).toEqual(['second', 'third']);
    expect(r.block).toContain('## first');
    expect(r.block).not.toContain('## second');
    expect(r.block).not.toContain('## third');
  });

  it('counts UTF-8 bytes, not chars (skills with multi-byte chars)', () => {
    // '✓' is 3 bytes in UTF-8. With a tight cap, skills that would fit by
    // char count but not by byte count must be dropped.
    const skill = { name: 'check', body: '✓'.repeat(100) }; // 300 bytes for body + ## name + '\n\n'
    const r = buildZenoContextBlock([skill], [], 200);
    expect(r.droppedSkills).toEqual(['check']);
  });

  it('truncatedBytes equals total of kept skills only', () => {
    const r = buildZenoContextBlock(
      [
        { name: 'small', body: 'x'.repeat(100) },
        { name: 'huge', body: 'x'.repeat(50_000) },
      ],
      [],
    );
    expect(r.droppedSkills).toEqual(['huge']);
    // truncatedBytes is the kept-skill running total, not the cap.
    const expectedKeptBytes = Buffer.byteLength(
      '## small\n\nx'.repeat(1) + 'x'.repeat(99),
      'utf-8',
    );
    // The piece is `## small\n\n` + body. body length = 100.
    expect(r.truncatedBytes).toBe(Buffer.byteLength(`## small\n\n${'x'.repeat(100)}`, 'utf-8'));
    expect(r.truncatedBytes).toBeLessThan(r.requestedBytes);
    // Avoid the dead-letter expectedKeptBytes calc above (kept for documentation).
    expect(expectedKeptBytes).toBeGreaterThan(0);
  });
});
