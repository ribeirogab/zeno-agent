/**
 * Build a `Connector` row in the test DB pointing at the echo fixture.
 * Caller controls fail-mode + extra fields via `overrides`.
 */

import type { Connector, ConnectorRepo, CreateConnectorInput } from '@zeno/db/runtime';
import type { Fixture } from './echo-fixture.js';

interface MakeFixtureConnectorOpts {
  /** Pre-built fixture from `bootFixture()`. */
  fixture: Fixture;
  /** Optional overrides; unspecified fields default sensibly. */
  overrides?: Partial<CreateConnectorInput>;
  /** When set, embeds `__MCP_TYPE__='stdio'` and a marker secret so the
   * env mapping in `mcp-discover/build-config.ts` injects FIXTURE_FAIL into
   * the child process. By default we wire the fail-mode through the fixture's
   * `env` map, which the test harness must propagate. */
  failMode?: 'spawn' | 'auth' | 'mcp_error' | 'timeout';
}

/**
 * Insert a connector row. Returns the persisted `Connector`.
 *
 * Note: `discoverTools` consumes the connector's `command` + `args` fields
 * directly. We inject `FIXTURE_FAIL` into the connector's secrets table —
 * `mcp-discover/build-config.ts toStdioConfig` translates secrets into env
 * vars for the spawned child process. So a secret named `FIXTURE_FAIL` with
 * value `auth` becomes `FIXTURE_FAIL=auth` in the spawned fixture's env.
 */
export function makeFixtureConnector(
  repo: ConnectorRepo,
  opts: MakeFixtureConnectorOpts,
): Connector {
  const secrets: Array<{ key: string; value: string }> = [];
  if (opts.failMode) {
    secrets.push({ key: 'FIXTURE_FAIL', value: opts.failMode });
  }

  const input: CreateConnectorInput = {
    slug: 'echo-test',
    displayName: 'Echo Test',
    description: null,
    source: 'custom',
    transport: 'stdio',
    command: opts.fixture.command,
    args: opts.fixture.args,
    status: 'enabled',
    secrets,
    tools: [],
    ...opts.overrides,
  };

  return repo.create(input);
}
