/**
 * In-memory SQLite test DB helper for spec 0037 Phase A.
 *
 * Each call to `makeTestDb()` returns a fresh in-memory DB with migrations
 * applied and the standard repos wired up. Caller must call `close()` when
 * done — typically in `afterEach`.
 */

import {
  AgentCapabilityRepo,
  CommandRepo,
  ConnectorRepo,
  closeDatabase,
  type DB,
  openDatabase,
  runMigrations,
} from '@zeno/storage';

export interface TestDb {
  db: DB;
  connectorRepo: ConnectorRepo;
  commandRepo: CommandRepo;
  agentCapabilityRepo: AgentCapabilityRepo;
  close: () => void;
}

export function makeTestDb(): TestDb {
  const db = openDatabase(':memory:');
  runMigrations(db);
  // Spec 0066 C: migration 20 seeds the Playwright connector. The
  // E2E lifecycle suite asserts a clean baseline (no rows / specific
  // counts) so we wipe the seed for these helpers. Production boots
  // keep the seed; these tests just want the empty-table guarantee.
  db.prepare("DELETE FROM connectors WHERE slug = 'playwright'").run();
  return {
    db,
    connectorRepo: new ConnectorRepo(db),
    commandRepo: new CommandRepo(db),
    agentCapabilityRepo: new AgentCapabilityRepo(db),
    close: () => closeDatabase(db),
  };
}
