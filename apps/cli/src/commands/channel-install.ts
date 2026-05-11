/**
 * Spec 2026-05-11 — `zeno channel install [type]` — install a channel from the catalog.
 *
 * Wire: `POST /api/connectors` with `kind: 'channel'`. Channels share storage with
 * connectors, so the install flow reuses the connectors install endpoint. The
 * operator-facing surface is `zeno channel install`; the wire is shared.
 *
 * Picker behaviour: with a positional, install directly. Without (TTY): open a
 * picker over the catalog (even with one entry, no auto-pick — forward-compat).
 * Without (non-TTY): exit 1.
 *
 * Required fields (catalog `required: true, public: false`) prompt for hidden input
 * unless supplied via `--secret KEY=VALUE`. Public optional fields are not prompted
 * during install — operator uses `zeno channel configure <slug>` after install.
 */

import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import { ApiClient } from '../lib/api-client.js';
import { c, err, isQuiet, ok, setQuiet } from '../lib/output.js';
import { pick } from '../lib/picker.js';
import { promptHidden } from '../lib/prompt.js';
import { resolveProfile } from '../lib/resolvers.js';

interface CatalogFieldRemote {
  key: string;
  label: string;
  help?: string;
  required: boolean;
  public: boolean;
  inputType: 'text' | 'password' | 'pem';
}

interface CatalogEntryRemote {
  id: string;
  slug: string;
  name: string;
  description: string;
  fields: CatalogFieldRemote[];
}

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function parseSecretFlags(raw: string | string[] | undefined): Map<string, string> {
  const flags = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  const m = new Map<string, string>();
  for (const pair of flags) {
    const idx = pair.indexOf('=');
    if (idx === -1) {
      console.error(err(`invalid --secret flag: '${pair}' (expected KEY=VALUE)`));
      process.exit(1);
    }
    m.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
  return m;
}

export default defineCommand({
  meta: { name: 'install', description: 'install a channel from the catalog' },
  args: {
    type: { type: 'positional', description: 'channel type (slack, ...)', required: false },
    profile: { type: 'string', description: 'profile name', required: false },
    secret: { type: 'string', description: 'KEY=VALUE — can repeat for multiple', required: false },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClient({ baseUrl });

    const catalog = await client.get<{ channels: CatalogEntryRemote[] }>(
      '/api/channels/catalog',
    );

    let type = args.type as string | undefined;
    if (!type) {
      if (!isInteractive()) {
        console.error(err('usage: zeno channel install <type>'));
        process.exit(1);
      }
      const idx = await pick(
        catalog.channels.map((c) => ({ label: c.id, hint: c.name })),
        { title: `${c.bold('select channel to install')}  ${c.gray('↑/↓ + Enter')}` },
      );
      if (idx === null) {
        console.error(err('aborted'));
        process.exit(1);
      }
      type = catalog.channels[idx]?.id;
    }

    const entry = catalog.channels.find((c) => c.id === type);
    if (!entry) {
      console.error(err(`unknown channel type: ${type}`));
      process.exit(1);
    }

    const provided = parseSecretFlags(args.secret as string | string[] | undefined);
    const secretsPayload: Array<{ key: string; value: string }> = [];

    for (const field of entry.fields) {
      const direct = provided.get(field.key);
      if (direct !== undefined) {
        secretsPayload.push({ key: field.key, value: direct });
        continue;
      }
      if (!field.required) continue; // optional fields skipped at install time; configure later
      if (field.public) continue; // public optional only — should not be required+public per catalog convention
      if (!isInteractive()) {
        console.error(err(`missing required secret: ${field.key} (use --secret ${field.key}=…)`));
        process.exit(1);
      }
      const value = await promptHidden(`${field.label} (${field.key})`, field.help);
      secretsPayload.push({ key: field.key, value });
    }

    try {
      await client.post('/api/connectors', {
        source: 'catalog',
        catalogId: type,
        kind: 'channel',
        secrets: secretsPayload,
      });
      if (!isQuiet()) console.log(ok(`${type} · installed`));
    } catch (e: unknown) {
      const apiErr = e as { status?: number; body?: { error?: string } };
      if (apiErr.status === 409 && apiErr.body?.error === 'already_installed') {
        if (!isQuiet()) console.error(err(`${type} already installed`));
        return; // exit 0 — idempotent
      }
      throw e;
    }
  },
});
