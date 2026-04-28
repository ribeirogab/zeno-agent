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
  return {
    db,
    connectorRepo: new ConnectorRepo(db),
    commandRepo: new CommandRepo(db),
    agentCapabilityRepo: new AgentCapabilityRepo(db),
    close: () => closeDatabase(db),
  };
}
