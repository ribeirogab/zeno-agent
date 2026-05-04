import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Spec 0060: SOUL.md content lint.
 *
 * Spec 0049 retired skills and the SOUL.md was rewritten with a "Skills
 * (deferred)" section telling the agent skills are not part of the runtime.
 * Spec 0052 brought skills back as DB-managed playbooks materialized to
 * `~/.claude/skills/`, but the SOUL.md was never updated — the resulting
 * contradiction (preset announces skills + SOUL says ignore them) caused
 * the agent to freelance output and ignore SKILL.md templates (e.g.,
 * a code-review skill's Templates A/B/C/D shape contract for PR reviews).
 *
 * This test is the regression guard. Any future PR that reverts to the
 * "deferred" framing — or removes the positive Skills section entirely —
 * fails CI before it ships.
 */

const SOUL_PATH = join(__dirname, '../../../../agent/SOUL.md');

describe('SOUL.md content lint (spec 0060)', () => {
  const soul = readFileSync(SOUL_PATH, 'utf-8');

  it('does NOT contain the legacy "(deferred)" framing near "Skills"', () => {
    // Cheap check: the literal substring "Skills (deferred)" is what spec 0049
    // produced. Future drifts could also write "deferred skills" or similar —
    // catch the dangerous neighborhood, not just the exact string.
    expect(soul).not.toMatch(/Skills\s*\(deferred\)/i);
    expect(soul).not.toMatch(/skills.{0,80}not\s+part\s+of\s+how\s+you\s+work/i);
    expect(soul).not.toMatch(/skills\s+as\s+a\s+runtime\s+concept.{0,40}deferred/i);
  });

  it('has a positive "## Skills" section without the "(deferred)" qualifier', () => {
    expect(soul).toMatch(/^##\s+Skills\s*$/m);
  });

  it('Skills section instructs the agent to follow SKILL.md templates literally', () => {
    // Locate the Skills section and assert it positively frames skills as
    // mandatory when matching. The exact wording can evolve, but the
    // contract MUST be present: "read the SKILL.md" + "follow ... literally"
    // (or equivalent imperative language).
    const skillsSectionMatch = soul.match(/^##\s+Skills\s*$([\s\S]*?)(?=^##\s|Z)/m);
    expect(skillsSectionMatch, 'no "## Skills" section found').not.toBeNull();
    const body = skillsSectionMatch?.[1] ?? '';
    expect(body).toMatch(/SKILL\.md/);
    expect(body).toMatch(/literally|literal|character-for-character/i);
  });
});
