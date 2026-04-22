import { existsSync, readFileSync } from 'node:fs';
import { createLogger } from '@zeno/logger';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const logger = createLogger({ service: 'worker' });

const PROFILE_CANDIDATES = ['/app/profile', 'profile'];

const ApprovalsSchema = z
  .object({
    owner_slack_user_id: z.string().regex(/^U[A-Z0-9]+$/),
    always_sensitive: z.array(z.string()).default([]),
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

  return ApprovalsSchema.parse(fileResult.data.approvals) ?? null;
}
