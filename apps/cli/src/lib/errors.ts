import { ApiError } from './api-client.js';
import { c, err } from './output.js';

export interface Hint {
  msg: string;
  hint?: string;
}

/**
 * Caller surface where the error happened. Lets `friendly()` tailor the
 * follow-up hint — `auth_failed` during install asks for a retry with the
 * same install command, while during a test/reveal it asks the operator to
 * update the stored token. Default `'default'` keeps the legacy message.
 */
export type FriendlyContext = 'install' | 'test' | 'reveal' | 'default';

type MapEntry = (e: ApiError, ctx: FriendlyContext) => Hint;

const map: Record<string, MapEntry> = {
  single_instance_catalog_already_installed: (e) => {
    const body = (e.body ?? {}) as { catalogId?: string; slug?: string };
    return {
      msg: `${body.catalogId ?? 'connector'} already installed (single-instance)`,
      hint: `uninstall first: zeno connector uninstall ${body.slug ?? body.catalogId ?? '<slug>'}`,
    };
  },
  app_already_installed: (e) => {
    const body = (e.body ?? {}) as { catalogId?: string };
    return {
      msg: `app catalog ${body.catalogId ?? ''} already installed`,
      hint: 'uninstall first: zeno connector app uninstall',
    };
  },
  auth_failed: (e, ctx) => {
    const body = (e.body ?? {}) as {
      detail?: string;
      slug?: string;
      key?: string;
      catalogId?: string;
    };
    const result: Hint = {
      msg: `auth failed (${body.detail ?? 'upstream rejected token'})`,
    };
    if (ctx === 'install' && body.catalogId && body.key) {
      result.hint = `verify token, then retry: zeno connector install ${body.catalogId} --secret ${body.key}=VALUE`;
    } else if ((ctx === 'test' || ctx === 'reveal') && body.slug && body.key) {
      result.hint = `update token: zeno connector secret set ${body.slug} ${body.key}`;
    } else if (body.slug && body.key) {
      // Default keeps the legacy "update token" wording (substituted from "rotate").
      result.hint = `update token: zeno connector secret set ${body.slug} ${body.key}`;
    }
    return result;
  },
  rate_limited: (e) => {
    const body = (e.body ?? {}) as { retryAfter?: number };
    const result: Hint = { msg: 'rate limited' };
    if (body.retryAfter) result.hint = `retry after ${body.retryAfter}s`;
    return result;
  },
  mode_cli_only: () => ({
    msg: 'mutations are CLI-only on this profile (ZENO_API_WRITES=cli)',
    hint: 'run the equivalent zeno command from this CLI',
  }),
  catalog_entry_not_found: (e) => {
    const body = (e.body ?? {}) as { catalogId?: string };
    return {
      msg: `catalog entry ${body.catalogId ?? ''} not found`,
      hint: 'list available: zeno connector catalog',
    };
  },
  connector_not_found: (e) => {
    const body = (e.body ?? {}) as { slug?: string };
    return {
      msg: `connector ${body.slug ?? ''} not found`,
      hint: 'list installed: zeno connector list',
    };
  },
};

export function friendly(e: ApiError, context: FriendlyContext = 'default'): Hint {
  const body = (e.body ?? {}) as { error?: string };
  const code = body.error ?? '';
  return map[code]?.(e, context) ?? { msg: e.message };
}

export interface RunCommandOptions {
  context?: FriendlyContext;
}

export async function runCommand<T>(
  fn: () => Promise<T>,
  opts: RunCommandOptions = {},
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) {
      const { msg, hint } = friendly(e, opts.context);
      process.stderr.write(`${err(msg)}\n`);
      if (hint) process.stderr.write(`${c.gray(`  → ${hint}`)}\n`);
      process.exit(1);
      return undefined;
    }
    throw e;
  }
}
