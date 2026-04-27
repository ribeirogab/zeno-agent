/**
 * 1-shot data migration: yaml `approvals.always_sensitive` → DB
 * `approval_rules` table. Spec 0047.
 *
 * Idempotent: runs only when `approval_rules` is empty AND the yaml array is
 * non-empty. Subsequent boots are no-ops (DB has rows; this returns 0).
 *
 * Called from worker `main()` after `runMigrations(db)` and before the
 * guardrails policies are constructed.
 */

import { createLogger } from '@zeno/logger';
import type { ApprovalRulesRepo } from '@zeno/storage';

const logger = createLogger({ service: 'worker' });

export interface MigrationResult {
  migrated: number;
  skipped: 'already-in-db' | 'no-yaml-rules' | null;
}

export function migrateYamlAlwaysSensitiveToDb(
  rulesRepo: ApprovalRulesRepo,
  yamlPatterns: string[],
): MigrationResult {
  const existingCount = rulesRepo.count();
  if (existingCount > 0) {
    return { migrated: 0, skipped: 'already-in-db' };
  }
  if (yamlPatterns.length === 0) {
    return { migrated: 0, skipped: 'no-yaml-rules' };
  }

  let migrated = 0;
  for (const pattern of yamlPatterns) {
    try {
      rulesRepo.create({
        pattern,
        source: 'yaml-migrated',
        notes: 'migrated from profile/config.yaml on first boot',
      });
      migrated += 1;
    } catch (err) {
      // UNIQUE conflict (multiple yaml entries with the same pattern) —
      // log and continue. Spec calls for idempotency; surviving the conflict
      // is the right behavior.
      logger.warn(
        { event: 'approval_rules_migration_conflict', pattern, err: String(err) },
        'skipping duplicate pattern during yaml-to-DB migration',
      );
    }
  }
  logger.info(
    { event: 'approval_rules_migrated', count: migrated, total: yamlPatterns.length },
    'yaml always_sensitive rules migrated to DB',
  );
  return { migrated, skipped: null };
}
