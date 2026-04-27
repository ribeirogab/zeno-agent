import { existsSync, readFileSync } from 'node:fs';
import { createLogger } from '@zeno/logger';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const logger = createLogger({ service: 'worker' });

const PROFILE_CANDIDATES = ['/app/profile', 'profile'];

// Spec 0048 Q5: `always_sensitive` removed from yaml. Authoritative source
// is the `approval_rules` DB table (spec 0047). The pre-parse rejection
// check in `loadApprovalsConfig` raises a helpful error if operators still
// have it in yaml, forcing a clean migration.
const ApprovalsSchema = z
  .object({
    owner_slack_user_id: z.string().regex(/^U[A-Z0-9]+$/),
    always_allowed_tools: z.array(z.string()).default(['Read', 'Glob', 'Grep']),
    always_allowed_commands: z.array(z.string()).default([]),
    approval_timeout_sec: z.number().int().min(10).max(3600).default(600),
    classifier_model: z.string().default('claude-haiku-4-5'),
    dm_owner_only: z.boolean().default(true),
  })
  .optional();

export type ApprovalsConfig = NonNullable<z.infer<typeof ApprovalsSchema>>;

const ConfigFileSchema = z
  .object({
    approvals: z.unknown().optional(),
  })
  .passthrough();

function findProfileFile(filename: string): string | null {
  for (const base of PROFILE_CANDIDATES) {
    const path = `${base}/${filename}`;
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * Read profile/config.yaml and return the parsed `approvals:` section.
 *
 * Returns `null` when:
 *   - the file is missing (no profile mounted)
 *   - the file has no `approvals:` key (guardrails disabled)
 *
 * Throws when the `approvals:` section is present but malformed — boot must
 * fail loudly rather than silently disabling guardrails.
 */
export function loadApprovalsConfig(): ApprovalsConfig | null {
  const path = findProfileFile('config.yaml');
  if (!path) {
    logger.info(
      { event: 'config_file_missing' },
      'profile/config.yaml not found, guardrails disabled',
    );
    return null;
  }

  const raw = readFileSync(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = parseYaml(raw) ?? {};
  } catch (error) {
    logger.error(
      { event: 'config_file_invalid', err: String(error) },
      'config.yaml is malformed, guardrails disabled',
    );
    return null;
  }

  const fileResult = ConfigFileSchema.safeParse(parsed);
  if (!fileResult.success) {
    logger.error(
      { event: 'config_schema_error', err: fileResult.error.message },
      'config.yaml top-level shape is invalid, guardrails disabled',
    );
    return null;
  }

  if (fileResult.data.approvals === undefined) {
    return null;
  }

  // Spec 0048 Q5: hard-fail if the deprecated `always_sensitive` field is
  // still present. Pre-parse check (rather than .strict() on the schema)
  // targets this single deprecated key without rejecting unrelated future
  // additions.
  const approvalsRaw = fileResult.data.approvals as Record<string, unknown>;
  if (approvalsRaw && typeof approvalsRaw === 'object' && 'always_sensitive' in approvalsRaw) {
    throw new Error(
      'Field `approvals.always_sensitive` is no longer supported in yaml. ' +
        'Migrate to DB-managed rules at /settings (Sensitive tools section). ' +
        'See spec 0047 for the migration. Remove the field from profile/config.yaml.',
    );
  }

  return ApprovalsSchema.parse(fileResult.data.approvals) ?? null;
}
