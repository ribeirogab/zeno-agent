// Echo MCP fixture for spec 0037 Phase A regression suite.
//
// Plain `.mjs` (no TypeScript) because no workspace has tsx/ts-node.
// Boot: `node apps/worker/tests/connectors-e2e/fixtures/echo-mcp/server.mjs`.
//
// Three tools — categorized by `mcp-discover/classifyToolCategory`:
//   read_echo         (read; matches "read_" prefix)
//   write_echo        (write; matches "write_"... wait, "write_" is not in
//                     WRITE_PREFIXES but "send_/post_/put_/create_/update_/delete_"
//                     are. We use a name guaranteed to land in `write` category.)
//   interactive_echo  (interactive; "interactive_" is in neither prefix list
//                     so it falls through to interactive)
//
// Failure modes via `FIXTURE_FAIL` env var (4 modes — see spec 0037 §Constraints):
//   spawn      — exit(1) immediately
//   auth       — tools/list ok; tools/call returns Unauthorized
//   mcp_error  — tools/list ok; tools/call returns generic non-auth error
//   timeout    — sleep 30s before any response (combined with discoverTools'
//                10s timeout produces errorKind:'timeout')
//   (unset)    — happy path
//
// READ_PREFIXES in mcp-discover are: read_, list_, get_, search_, find_.
// WRITE_PREFIXES are: create_, update_, delete_, send_, post_, put_.
// `read_echo` lands in `read`. `update_echo` would land in `write`. We use
// `update_echo` to keep the canonical "echo" name while landing in write.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const FAIL = process.env.FIXTURE_FAIL || '';

if (FAIL === 'spawn') {
  process.exit(1);
}

if (FAIL === 'timeout') {
  // Sleep 30s before doing anything. discoverTools timeout (10s) will fire.
  await new Promise((r) => setTimeout(r, 30_000));
}

const server = new McpServer(
  { name: 'echo-fixture', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

function makeHandler(label) {
  return async ({ message }) => {
    if (FAIL === 'auth') {
      throw new Error('Unauthorized: fixture auth-fail mode');
    }
    if (FAIL === 'mcp_error') {
      throw new Error('fixture: simulated tool error (not auth)');
    }
    return {
      content: [{ type: 'text', text: `${label}:${message}` }],
    };
  };
}

server.registerTool(
  'read_echo',
  {
    description: 'Echoes the input message. Used by P1.1 / P1.5 / P4 tests.',
    inputSchema: { message: z.string().optional() },
  },
  makeHandler('read'),
);

server.registerTool(
  'update_echo',
  {
    description: 'Echoes the input message; categorized as write because update_ matches WRITE_PREFIXES.',
    inputSchema: { message: z.string().optional() },
  },
  makeHandler('write'),
);

server.registerTool(
  'interactive_echo',
  {
    description: 'Echoes the input message; falls through to interactive category (no prefix match).',
    inputSchema: { message: z.string().optional() },
  },
  makeHandler('interactive'),
);

const transport = new StdioServerTransport();
await server.connect(transport);
