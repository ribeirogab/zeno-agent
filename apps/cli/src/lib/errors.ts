import { ApiError } from './api-client.js';
import { c, err } from './output.js';

export interface Hint {
  msg: string;
  hint?: string;
}

type MapEntry = (e: ApiError) => Hint;

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
  auth_failed: (e) => {
    const body = (e.body ?? {}) as { detail?: string; slug?: string; key?: string };
    const hint =
      body.slug && body.key
        ? `rotate token: zeno connector secret set ${body.slug} ${body.key}`
        : undefined;
    return {
      msg: `auth failed (${body.detail ?? 'upstream rejected token'})`,
      hint,
    };
  },
  rate_limited: (e) => {
    const body = (e.body ?? {}) as { retryAfter?: number };
    return {
      msg: 'rate limited',
      hint: body.retryAfter ? `retry after ${body.retryAfter}s` : undefined,
    };
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

export function friendly(e: ApiError): Hint {
  const body = (e.body ?? {}) as { error?: string };
  const code = body.error ?? '';
  return map[code]?.(e) ?? { msg: e.message };
}

export async function runCommand<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) {
      const { msg, hint } = friendly(e);
      process.stderr.write(`${err(msg)}\n`);
      if (hint) process.stderr.write(`${c.gray(`  → ${hint}`)}\n`);
      process.exit(1);
      return undefined;
    }
    throw e;
  }
}
