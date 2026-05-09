import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl } from '../lib/api-client.js';
import { ok } from '../lib/output.js';
import { waitForCommand } from '../lib/wait-command.js';

export type SecretPrompter = (label: string) => Promise<string>;

interface SecretSetArgs {
  target: string;
  key: string;
  prompter?: SecretPrompter;
}

interface ConnectorDetail {
  id: string;
}

type SecretSetClient = Pick<ApiClient, 'get' | 'patch'>;

/**
 * Resolve the connector by slug-or-id, prompt for the new value with no echo,
 * then PATCH `/api/connectors/<id>` with `{ secrets: [{ key, value }] }`. The
 * endpoint enqueues a `connector_update` and returns 202 + correlationId; we
 * poll via `waitForCommand` until terminal.
 *
 * The `prompter` parameter is injected for testability — production wiring uses
 * a no-echo readline prompt; tests pass a deterministic mock.
 *
 * Spec 2026-05-08-connectors-cli-first-design Task 14.
 */
export async function runConnectorSecretSet(
  client: SecretSetClient,
  args: SecretSetArgs,
  print: (line: string) => void,
): Promise<void> {
  const detail = await client.get<ConnectorDetail>(
    `/api/connectors/${encodeURIComponent(args.target)}`,
  );
  const prompter = args.prompter ?? defaultNoEchoPrompter;
  const value = (await prompter(`${args.key} (input hidden): `)).trim();
  if (value.length === 0) {
    throw new Error(`empty value for ${args.key}; refusing to write`);
  }
  const post = (await client.patch(`/api/connectors/${detail.id}`, {
    secrets: [{ key: args.key, value }],
  })) as { correlationId: string };
  print(ok(`queued · correlationId=${post.correlationId}`));
  const status = await waitForCommand(client, post.correlationId);
  if (status.status === 'success') {
    print(ok(`${args.key} updated`));
    return;
  }
  throw new Error(`secret set failed: ${status.result ?? 'unknown'}`);
}

/**
 * Default prompter: read a line with stdin echo disabled so the secret never
 * lands on the terminal. Falls back to a normal echoed prompt if stdin is not
 * a TTY (e.g., piped input in CI), since `setRawMode` would throw there.
 *
 * Exported so sibling commands (e.g. `rotate`) can share the same default
 * without duplicating the no-echo plumbing.
 */
export async function defaultNoEchoPrompter(label: string): Promise<string> {
  if (input.isTTY && typeof input.setRawMode === 'function') {
    return readLineNoEcho(label);
  }
  const rl = createInterface({ input, output });
  try {
    return await rl.question(label);
  } finally {
    rl.close();
  }
}

const ETX = '\u0003'; // Ctrl+C
const DEL = '\u007f';
const BS = '\b';

function readLineNoEcho(label: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    output.write(label);
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');
    let buf = '';
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          cleanup();
          output.write('\n');
          resolve(buf);
          return;
        }
        if (ch === ETX) {
          cleanup();
          reject(new Error('aborted'));
          return;
        }
        if (ch === DEL || ch === BS) {
          buf = buf.slice(0, -1);
          continue;
        }
        buf += ch;
      }
    };
    const cleanup = () => {
      input.setRawMode(false);
      input.pause();
      input.removeListener('data', onData);
    };
    input.on('data', onData);
  });
}

export default defineCommand({
  meta: { name: 'set', description: 'set or replace a single secret value' },
  args: {
    target: { type: 'positional', description: 'slug or id', required: true },
    key: { type: 'positional', description: 'secret key', required: true },
    profile: { type: 'string', description: 'profile name', required: false },
  },
  async run({ args }) {
    const profile =
      typeof args.profile === 'string' && args.profile.length > 0 ? args.profile : 'default';
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClientImpl({ baseUrl });
    await runConnectorSecretSet(
      client,
      { target: args.target as string, key: args.key as string },
      (line) => console.log(line),
    );
  },
});
