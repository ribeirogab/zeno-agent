import { describe, expect, it } from 'vitest';
import { parseSkillFrontmatter } from '@/lib/parse-skill-frontmatter';

describe('parseSkillFrontmatter', () => {
  it('parses valid frontmatter and returns frontmatter + body', () => {
    const result = parseSkillFrontmatter(
      `---
name: frontend-design
description: Padrão de UX e revisão de código React/Tailwind.
---

# Frontend design review

Antes de aprovar PR de frontend...`,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frontmatter).toEqual({
      name: 'frontend-design',
      description: 'Padrão de UX e revisão de código React/Tailwind.',
    });
    expect(result.body).toContain('# Frontend design review');
  });

  it('ignores allowed-tools (skills.sh legacy field)', () => {
    const result = parseSkillFrontmatter(
      `---
name: frontend-design
description: d
allowed-tools: [Read, Edit, Write, Bash]
---

body`,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // allowed-tools is silently dropped
    expect(result.frontmatter).toEqual({ name: 'frontend-design', description: 'd' });
  });

  it('rejects when frontmatter block is missing entirely', () => {
    const result = parseSkillFrontmatter('# Just a heading\n\nno frontmatter here');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      expect.objectContaining({ field: 'frontmatter', code: 'missing' }),
    ]);
  });

  it('rejects when name is missing', () => {
    const result = parseSkillFrontmatter(
      `---
description: missing name
---

body`,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([expect.objectContaining({ field: 'name', code: 'required' })]);
  });

  it('rejects when description is missing', () => {
    const result = parseSkillFrontmatter(
      `---
name: x
---

body`,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      expect.objectContaining({ field: 'description', code: 'required' }),
    ]);
  });

  it('rejects when name is not kebab-case', () => {
    const result = parseSkillFrontmatter(
      `---
name: Frontend_Design
description: d
---

body`,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({
      field: 'name',
      code: 'invalid_format',
    });
  });

  it('returns multiple errors when multiple fields are bad', () => {
    const result = parseSkillFrontmatter(
      `---
name: NotKebab
---

body`,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.field).sort()).toEqual(['description', 'name']);
  });

  it('rejects invalid YAML in the frontmatter block', () => {
    const result = parseSkillFrontmatter(
      `---
name: x
description: "unclosed
---

body`,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({
      field: 'frontmatter',
      code: 'invalid_yaml',
    });
  });

  it('preserves the body verbatim (whitespace + markdown structure)', () => {
    const result = parseSkillFrontmatter(
      `---
name: a
description: b
---

# H1

paragraph

\`\`\`
code block
\`\`\``,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body).toBe('# H1\n\nparagraph\n\n```\ncode block\n```');
  });
});
