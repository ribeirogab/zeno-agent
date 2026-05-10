/**
 * Spec 0072 — orchestrate the claude OAuth flow inside the profile container.
 *
 * Spawns the catalog's `auto_flow.command` (today: `claude setup-token`) via
 * dockerode.exec PTY, parses the URL out of stdout via the catalog regex,
 * prompts the operator for the OAuth code, forwards the code to the
 * container's stdin, then captures the resulting OAuth token from stdout
 * via the catalog token regex.
 *
 * Returns the captured token as a plaintext string. Throws if the flow
 * exits without capturing a token (most common cause: operator cancelled).
 */

import { PassThrough } from 'node:stream';
import type Dockerode from 'dockerode';
import { runDockerExecPty } from './docker-exec-pty.js';

export interface ClaudeOAuthBackend {
  id: string;
  auto_flow: {
    command: string[];
    stdout_url_regex: string;
    stdout_token_regex: string;
    stdout_awaiting_code_regex?: string;
  };
}

export interface ClaudeOAuthOpts {
  /** Profile container — must already be running. */
  container: Pick<Dockerode.Container, 'exec'>;
  /** Catalog entry from @zeno/backends with auto_flow regexes. */
  backend: ClaudeOAuthBackend;
  /** Prompts the operator for the OAuth code (hidden input recommended). */
  promptCode: (url: string) => Promise<string>;
  /** Optional mirror — passed to runDockerExecPty. */
  mirror?: NodeJS.WritableStream | null;
}

/**
 * Returns the captured OAuth token. Throws if the spawned CLI exits without
 * one (caller decides how to surface to operator).
 */
export async function runClaudeOAuth(opts: ClaudeOAuthOpts): Promise<string> {
  const flow = opts.backend.auto_flow;
  const urlRe = new RegExp(flow.stdout_url_regex);
  const tokenRe = new RegExp(flow.stdout_token_regex);
  const awaitingRe = flow.stdout_awaiting_code_regex
    ? new RegExp(flow.stdout_awaiting_code_regex)
    : null;

  const stdin = new PassThrough();
  let url: string | null = null;
  let token: string | null = null;
  let codeSent = false;

  const sendCode = async (): Promise<void> => {
    if (codeSent || !url) return;
    codeSent = true;
    const code = await opts.promptCode(url);
    stdin.write(`${code}\r`);
  };

  const matchers = [
    {
      name: 'url',
      regex: urlRe,
      onMatch: (v: string) => {
        url = v;
        if (!awaitingRe) {
          // No awaiting-code prompt → ask immediately after URL is captured.
          void sendCode();
        }
      },
    },
    {
      name: 'token',
      regex: tokenRe,
      onMatch: (v: string) => {
        token = v;
        // Token captured — close stdin so the spawned CLI can exit cleanly.
        stdin.end();
      },
    },
  ];

  if (awaitingRe) {
    matchers.push({
      name: 'awaiting',
      regex: awaitingRe,
      onMatch: () => {
        void sendCode();
      },
    });
  }

  const opts2: Parameters<typeof runDockerExecPty>[0] = {
    container: opts.container,
    cmd: flow.command,
    stdin,
    matchers,
  };
  if (opts.mirror !== undefined) opts2.mirror = opts.mirror;
  await runDockerExecPty(opts2);

  if (!token) {
    throw new Error(`OAuth flow for ${opts.backend.id} exited without capturing a token`);
  }
  return token;
}
