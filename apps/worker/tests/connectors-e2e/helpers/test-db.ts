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
  openRuntimeDatabase,
  type RuntimeDB,
  runRuntimeMigrations,
} from '@zeno/db/runtime';
import type Database from 'better-sqlite3';

export interface TestDb {
  db: RuntimeDB;
  /**
   * Raw better-sqlite3 handle for tests that need to issue ad-hoc SQL
   * (counts, seeds, asserts) against the same connection.
   */
  raw: Database.Database;
  connectorRepo: ConnectorRepo;
  commandRepo: CommandRepo;
  agentCapabilityRepo: AgentCapabilityRepo;
  close: () => void;
}

export function makeTestDb(): TestDb {
  const opened = openRuntimeDatabase(':memory:');
  runRuntimeMigrations(opened.raw);
  // The runtime baseline does not auto-seed (per spec 0066 successor),
  // so the connectors table is already empty for tests that assert a
  // clean baseline.
  return {
    db: opened.drizzle,
    raw: opened.raw,
    connectorRepo: new ConnectorRepo(opened.drizzle, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    }),
    commandRepo: new CommandRepo(opened.drizzle),
    agentCapabilityRepo: new AgentCapabilityRepo(opened.drizzle),
    close: opened.close,
  };
}
