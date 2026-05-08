import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { openRuntimeDatabase, runRuntimeMigrations } from '../../src/runtime/db.js';
import { connectorToolPermissions, connectors } from '../../src/runtime/schema.js';
import { seedDefaultConnectors } from '../../src/runtime/seed.js';

describe('seedDefaultConnectors', () => {
  it('upserts default connectors on a fresh DB', () => {
    const { raw, drizzle: db, close } = openRuntimeDatabase(':memory:');
    try {
      runRuntimeMigrations(raw);
      const result = seedDefaultConnectors(db);
      expect(result.seeded).toBeGreaterThan(0);

      const playwright = db
        .select()
        .from(connectors)
        .where(eq(connectors.slug, 'playwright'))
        .get();
      expect(playwright).toBeDefined();
      expect(playwright?.displayName).toBe('Playwright');

      const tools = db
        .select()
        .from(connectorToolPermissions)
        .where(eq(connectorToolPermissions.connectorId, playwright!.id))
        .all();
      expect(tools).toHaveLength(5);
    } finally {
      close();
    }
  });

  it('is idempotent — second invocation seeds zero new connectors', () => {
    const { raw, drizzle: db, close } = openRuntimeDatabase(':memory:');
    try {
      runRuntimeMigrations(raw);
      seedDefaultConnectors(db);
      const second = seedDefaultConnectors(db);
      expect(second.seeded).toBe(0);

      const allConnectors = db.select().from(connectors).all();
      expect(allConnectors).toHaveLength(1);
    } finally {
      close();
    }
  });
});
