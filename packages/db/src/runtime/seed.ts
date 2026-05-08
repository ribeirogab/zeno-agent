import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { RuntimeDB } from './db.js';
import { connectorToolPermissions, connectors } from './schema.js';

interface DefaultConnector {
  slug: string;
  displayName: string;
  description: string;
  source: 'catalog';
  catalogId: string;
  transport: 'stdio';
  command: string;
  args: string;
  tools: Array<{
    toolName: string;
    description: string;
    category: 'read' | 'write' | 'interactive';
    permission: 'always_allow' | 'ask' | 'never';
  }>;
}

const DEFAULTS: DefaultConnector[] = [
  {
    slug: 'playwright',
    displayName: 'Playwright',
    description: 'Browser automation. Navigate, snapshot, click, type, screenshot.',
    source: 'catalog',
    catalogId: 'playwright',
    transport: 'stdio',
    command: 'npx',
    args: JSON.stringify(['-y', '@playwright/mcp@latest']),
    tools: [
      {
        toolName: 'browser_navigate',
        description: 'Navigate to a URL in the browser.',
        category: 'read',
        permission: 'always_allow',
      },
      {
        toolName: 'browser_snapshot',
        description: 'Capture an accessibility snapshot of the current page.',
        category: 'read',
        permission: 'always_allow',
      },
      {
        toolName: 'browser_take_screenshot',
        description: 'Take a screenshot of the current page or an element.',
        category: 'read',
        permission: 'always_allow',
      },
      {
        toolName: 'browser_click',
        description: 'Click on a web page element.',
        category: 'interactive',
        permission: 'ask',
      },
      {
        toolName: 'browser_type',
        description: 'Type text into an editable element.',
        category: 'interactive',
        permission: 'ask',
      },
    ],
  },
];

export function seedDefaultConnectors(db: RuntimeDB): { seeded: number } {
  let seeded = 0;
  for (const c of DEFAULTS) {
    const existing = db
      .select({ id: connectors.id })
      .from(connectors)
      .where(eq(connectors.slug, c.slug))
      .get();

    let connectorId = existing?.id;

    if (!existing) {
      connectorId = randomUUID();
      db.insert(connectors)
        .values({
          id: connectorId,
          slug: c.slug,
          displayName: c.displayName,
          description: c.description,
          source: c.source,
          catalogId: c.catalogId,
          transport: c.transport,
          command: c.command,
          args: c.args,
          status: 'enabled',
        })
        .run();
      seeded++;
    }

    if (connectorId) {
      for (const tool of c.tools) {
        db.insert(connectorToolPermissions)
          .values({
            connectorId,
            toolName: tool.toolName,
            description: tool.description,
            category: tool.category,
            permission: tool.permission,
          })
          .onConflictDoNothing({
            target: [connectorToolPermissions.connectorId, connectorToolPermissions.toolName],
          })
          .run();
      }
    }
  }
  return { seeded };
}
