/**
 * Shared helpers for discovering MCP server tools and building SDK config from
 * connector rows. Spec 0033 + 0034.
 *
 * Used by:
 *   - apps/worker (loader, refresh-tools handler)
 *   - apps/api (synchronous test-connection endpoints)
 */

export type { McpServerConfig } from './build-config.js';
export {
  RESERVED_AUTHORIZATION_KEY,
  RESERVED_MCP_TYPE_KEY,
  toRemoteConfig,
  toStdioConfig,
} from './build-config.js';
export {
  classifyToolCategory,
  type DiscoverErrorKind,
  type DiscoveredTool,
  type DiscoverToolsResult,
  discoverTools,
} from './discover.js';
