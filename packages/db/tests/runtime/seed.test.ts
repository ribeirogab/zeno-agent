import { describe, expect, it } from 'vitest';
import { openRuntimeDatabase, runRuntimeMigrations } from '../../src/runtime/db.js';
import { connectors } from '../../src/runtime/schema.js';
import { seedDefaultConnectors } from '../../src/runtime/seed.js';

describe('seedDefaultConnectors', () => {
  it('seeds zero connectors on a fresh DB (CLI-first model)', () => {
    // Spec 2026-05-08-connectors-cli-first-design: no connectors are
    // auto-seeded — the catalog is a directory the operator opts into via
    // `zeno connector install`. The seed function still runs (for forward
    // compatibility) but its `DEFAULTS` list is empty.
    const { raw, drizzle: db, close } = openRuntimeDatabase(':memory:');
    try {
      runRuntimeMigrations(raw);
      const result = seedDefaultConnectors(db);
      expect(result.seeded).toBe(0);

      const allConnectors = db.select().from(connectors).all();
      expect(allConnectors).toHaveLength(0);
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
      expect(allConnectors).toHaveLength(0);
    } finally {
      close();
    }
  });
});
