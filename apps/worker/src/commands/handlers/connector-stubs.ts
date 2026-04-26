import type { Handler } from '@/commands/dispatcher';

/**
 * Placeholder handlers for the four `connector_*` command types declared in
 * spec 0032 (CommandType extension). Real implementations land in spec 0034
 * Phase 6 (along with the dashboard API endpoints that enqueue them).
 *
 * The dispatcher's `if (!h)` branch already handles missing handlers, but
 * `HandlerMap = Record<Command['type'], Handler>` requires every type to be
 * present. These stubs satisfy the type check during the bootstrap window
 * between 0032 and 0034.
 */
export function buildConnectorStubHandler(type: string): Handler {
  return async () => ({ ok: false, error: `${type} not yet implemented (spec 0034)` });
}
