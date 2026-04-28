/**
 * Skill .md frontmatter parser. Spec 0052 Phase C.2.
 *
 * Validates `name` (kebab-case, required) + `description` (non-empty,
 * required). Body is everything after the second `---`. Any other
 * frontmatter fields (notably skills.sh's `allowed-tools`) are silently
 * ignored — capabilities are global in spec 0052, not per-skill.
 *
 * Returns a discriminated union so callers can branch on success/failure
 * without try/catch ambiguity. The dashboard's install modal renders the
 * `errors` array directly (Paper artboard M-skill-1b).
 */

import { parse as parseYaml } from 'yaml';

export interface ParseSuccess {
  ok: true;
  frontmatter: { name: string; description: string };
  body: string;
}

export interface ParseError {
  field: string;
  code: string;
  message: string;
}

export interface ParseFailure {
  ok: false;
  errors: ParseError[];
}

const NAME_REGEX = /^[a-z][a-z0-9-]*$/;
const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export function parseSkillFrontmatter(content: string): ParseSuccess | ParseFailure {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) {
    return {
      ok: false,
      errors: [
        {
          field: 'frontmatter',
          code: 'missing',
          message: 'file must start with a `---` block followed by `name:` and `description:`',
        },
      ],
    };
  }
  const [, yamlBlock, body] = match;
  let parsed: Record<string, unknown>;
  try {
    const result = parseYaml(yamlBlock ?? '');
    parsed = (result && typeof result === 'object' ? result : {}) as Record<string, unknown>;
  } catch (err) {
    return {
      ok: false,
      errors: [
        {
          field: 'frontmatter',
          code: 'invalid_yaml',
          message: `frontmatter is not valid YAML: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }

  const errors: ParseError[] = [];
  const name = parsed.name;
  const description = parsed.description;

  if (typeof name !== 'string' || name.length === 0) {
    errors.push({
      field: 'name',
      code: 'required',
      message: 'name must be a non-empty string',
    });
  } else if (!NAME_REGEX.test(name)) {
    errors.push({
      field: 'name',
      code: 'invalid_format',
      message: `name must be kebab-case (lowercase letters, digits, hyphens), got '${name}'`,
    });
  }

  if (typeof description !== 'string' || description.length === 0) {
    errors.push({
      field: 'description',
      code: 'required',
      message: 'description must be a non-empty string',
    });
  }

  // Spec 0052: `allowed-tools` (skills.sh format) is intentionally ignored.
  // Capabilities are global (/settings/agent-capabilities). Don't validate,
  // don't pass through to storage. The skill's body can still mention which
  // tools it expects to use as documentation.

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    frontmatter: { name: name as string, description: description as string },
    body: (body ?? '').trim(),
  };
}
